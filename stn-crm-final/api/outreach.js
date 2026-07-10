// Eén verzamel-endpoint voor de hele Outreach-module (Vercel Hobby-limiet: max
// 12 functions per deployment — zie api/admin.js/api/admin-write.js voor
// hetzelfde patroon). Verzenden gaat volledig via Gmail (OAuth, geen externe
// mailprovider meer). Drie soorten aanroepers delen dit bestand:
//  - de app zelf (Bearer-sessie, GET ?resource=... / POST { action })
//  - Vercel Cron (Bearer CRON_SECRET, verwerkt de flow-wachtrij + Gmail watch())
//  - Gmail Pub/Sub (geen sessie mogelijk — geverifieerd via een geheime
//    query-param, zie GMAIL_PUBSUB_SECRET) en de open-/klik-tracking-links
//    (auth = de niet-raadbare token zelf)
const crypto = require('crypto')
const { getServiceClient, requireUser } = require('./_shared')

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeDomain(url) {
  if (!url) return null
  try {
    let host = new URL(url.match(/^https?:\/\//i) ? url : `https://${url}`).hostname
    return host.toLowerCase().replace(/^www\./, '').replace(/\/+$/, '')
  } catch (e) {
    return url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function renderTemplate(text, { name, city, sector }) {
  if (!text) return text
  return text
    .replace(/\{bedrijfsnaam\}/g, name || '')
    .replace(/\{plaats\}/g, city || '')
    .replace(/\{sector\}/g, sector || '')
}

// Grove plaatsnaam-extractie uit een Nederlands adres ("Stationsstraat 1, 7511 AB Enschede")
// — laatste woord-cluster na de postcode, best-effort voor placeholder-invulling.
function guessCity(address) {
  if (!address) return ''
  const m = address.match(/\d{4}\s?[A-Z]{2}\s+(.+)$/)
  if (m) return m[1].split(',')[0].trim()
  const parts = address.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

function requireOrgId(body) {
  const organizationId = body?.organizationId
  if (!organizationId) { const e = new Error('organizationId ontbreekt.'); e.status = 400; throw e }
  return organizationId
}

// ─── Prospects: Google Places zoeken + duplicaatcheck ──────────────────────

async function searchPlaces(service, body) {
  const organizationId = requireOrgId(body)
  const { query, region } = body
  if (!query || !region) { const e = new Error('Zoekterm en regio zijn verplicht.'); e.status = 400; throw e }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    const e = new Error('GOOGLE_PLACES_API_KEY is niet ingesteld — voeg deze toe in Vercel voordat je kunt zoeken.')
    e.status = 400; throw e
  }

  const r = await fetchWithTimeout('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri',
    },
    body: JSON.stringify({ textQuery: `${query} in ${region}`, languageCode: 'nl' }),
  }, 15000)
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    const e = new Error(`Google Places gaf een fout (HTTP ${r.status}): ${body.slice(0, 300)}`)
    e.status = 502; throw e
  }
  const data = await r.json()
  const places = data.places || []
  if (!places.length) return { inserted: 0, duplicates: 0, prospects: [] }

  const [{ data: existingProspects }, { data: pipelineRows }] = await Promise.all([
    service.from('outreach_prospects').select('id, website_domain').eq('organization_id', organizationId),
    service.from('pipeline').select('id, website').eq('organization_id', organizationId),
  ])
  const existingByDomain = new Map((existingProspects || []).filter(p => p.website_domain).map(p => [p.website_domain, p.id]))
  const pipelineByDomain = new Map((pipelineRows || []).filter(p => p.website).map(p => [normalizeDomain(p.website), p.id]))

  const rows = []
  for (const place of places) {
    const website = place.websiteUri || null
    const domain = normalizeDomain(website)
    rows.push({
      organization_id: organizationId,
      name: place.displayName?.text || '(onbekend)',
      address: place.formattedAddress || null,
      sector: query,
      website,
      website_domain: domain,
      phone: place.internationalPhoneNumber || null,
      place_id: place.id,
      duplicate_prospect_id: domain ? (existingByDomain.get(domain) || null) : null,
      duplicate_pipeline_id: domain ? (pipelineByDomain.get(domain) || null) : null,
    })
  }

  const { data: inserted, error } = await service.from('outreach_prospects')
    .upsert(rows, { onConflict: 'organization_id,place_id', ignoreDuplicates: true })
    .select()
  if (error) throw error

  return {
    inserted: (inserted || []).length,
    duplicates: rows.filter(r => r.duplicate_prospect_id || r.duplicate_pipeline_id).length,
    prospects: inserted || [],
  }
}

async function setProspectsSector(service, body) {
  const organizationId = requireOrgId(body)
  const { ids, sector } = body
  if (!Array.isArray(ids) || !ids.length) { const e = new Error('ids ontbreekt.'); e.status = 400; throw e }
  if (!sector || !sector.trim()) { const e = new Error('sector ontbreekt.'); e.status = 400; throw e }
  const { error } = await service.from('outreach_prospects').update({ sector: sector.trim() }).eq('organization_id', organizationId).in('id', ids)
  if (error) throw error
  return { ok: true, updated: ids.length }
}

// Cascadeert in de database naar outreach_emails/outreach_flow_state/
// outreach_sends (allemaal "on delete cascade" op prospect_id) — geen
// aparte opruimcode nodig. duplicate_prospect_id is wél zelfverwijzend
// zonder cascade-regel: als prospect A hier verwijderd wordt terwijl een
// andere rij B naar A wijst als "mogelijk duplicaat", blokkeert de FK de
// delete. Die verwijzing is na verwijdering toch zinloos, dus eerst
// ontkoppelen i.p.v. een schema-migratie nodig te hebben.
async function deleteProspects(service, body) {
  const organizationId = requireOrgId(body)
  const { ids } = body
  if (!Array.isArray(ids) || !ids.length) { const e = new Error('ids ontbreekt.'); e.status = 400; throw e }
  await service.from('outreach_prospects').update({ duplicate_prospect_id: null }).eq('organization_id', organizationId).in('duplicate_prospect_id', ids)
  const { error } = await service.from('outreach_prospects').delete().eq('organization_id', organizationId).in('id', ids)
  if (error) throw error
  return { ok: true, deleted: ids.length }
}

// CSV-import (bijv. export vanuit Mailmeteor) — kolom-mapping gebeurt in de
// UI, hier komt alleen al {name, website, phone, sector, email} per rij aan.
// Landt direct als 'approved' (dit is je eigen, al bekende lijst — geen
// scouting-beoordeling nodig) en verschijnt meteen in Prospects. Duplicaatcheck
// op zowel domein als e-mailadres tegen bestaande prospects + pipeline; plain
// insert i.p.v. upsert (CSV-rijen hebben geen place_id om op te dedupliceren),
// dus net als bij Places alleen een waarschuwing, geen harde blokkade.
async function importProspectsCsv(service, body) {
  const organizationId = requireOrgId(body)
  const { rows } = body
  if (!Array.isArray(rows) || !rows.length) { const e = new Error('Geen rijen om te importeren.'); e.status = 400; throw e }
  if (rows.length > 500) { const e = new Error('Max 500 rijen per import — splits het bestand.'); e.status = 400; throw e }

  const [{ data: existingProspects }, { data: pipelineRows }, { data: existingEmails }] = await Promise.all([
    service.from('outreach_prospects').select('id, website_domain').eq('organization_id', organizationId),
    service.from('pipeline').select('id, website, email').eq('organization_id', organizationId),
    service.from('outreach_emails').select('email, prospect_id, outreach_prospects!inner(organization_id)').eq('outreach_prospects.organization_id', organizationId),
  ])
  const existingByDomain = new Map((existingProspects || []).filter(p => p.website_domain).map(p => [p.website_domain, p.id]))
  const pipelineByDomain = new Map((pipelineRows || []).filter(p => p.website).map(p => [normalizeDomain(p.website), p.id]))
  const pipelineByEmail = new Map((pipelineRows || []).filter(p => p.email).map(p => [p.email.toLowerCase(), p.id]))
  const prospectByEmail = new Map((existingEmails || []).filter(e => e.email).map(e => [e.email.toLowerCase(), e.prospect_id]))

  let inserted = 0, duplicates = 0, emailsAdded = 0, failed = 0
  const batchSize = 5
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    await Promise.allSettled(batch.map(async row => {
      const name = (row.name || '').trim()
      if (!name) { failed++; return }
      const website = row.website?.trim() || null
      const domain = normalizeDomain(website)
      const email = row.email?.trim() || null
      const emailLower = email?.toLowerCase()
      const dupProspect = (domain ? existingByDomain.get(domain) : null) || (emailLower ? prospectByEmail.get(emailLower) : null)
      const dupPipeline = (domain ? pipelineByDomain.get(domain) : null) || (emailLower ? pipelineByEmail.get(emailLower) : null)
      const { data: p, error } = await service.from('outreach_prospects').insert([{
        organization_id: organizationId, name, website, website_domain: domain, status: 'approved',
        phone: row.phone?.trim() || null, sector: row.sector?.trim() || null,
        duplicate_prospect_id: dupProspect || null, duplicate_pipeline_id: dupPipeline || null,
      }]).select().single()
      if (error) { failed++; return }
      inserted++
      if (dupProspect || dupPipeline) duplicates++
      // Zodat een volgende rij in dezelfde CSV met hetzelfde domein/e-mailadres ook als duplicaat wordt gezien.
      if (domain) existingByDomain.set(domain, p.id)
      if (email) {
        const { error: eErr } = await service.from('outreach_emails').insert([{ prospect_id: p.id, email, confidence: 'found', source: 'CSV-import' }])
        if (!eErr) { emailsAdded++; prospectByEmail.set(emailLower, p.id) }
      }
    }))
  }
  return { inserted, duplicates, emailsAdded, failed }
}

async function listProspects(service, q) {
  const organizationId = q.organizationId
  if (!organizationId) { const e = new Error('organizationId ontbreekt.'); e.status = 400; throw e }
  const { data, error } = await service.from('outreach_prospects')
    .select('*, duplicate_pipeline:duplicate_pipeline_id(id, fname, lname, company), duplicate_prospect:duplicate_prospect_id(id, name)')
    .eq('organization_id', organizationId).order('created_at', { ascending: false })
  if (error) throw error
  return { prospects: data }
}

async function updateProspectStatus(service, body) {
  const organizationId = requireOrgId(body)
  const { id, status } = body
  if (!id || !['pending', 'approved', 'rejected'].includes(status)) { const e = new Error('Ongeldige aanvraag.'); e.status = 400; throw e }
  const { error } = await service.from('outreach_prospects').update({ status }).eq('id', id).eq('organization_id', organizationId)
  if (error) throw error
  return { ok: true }
}

// ─── E-mails: website bezoeken en e-mailadres zoeken ───────────────────────

async function scanPageForEmail(url) {
  try {
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': 'STN-CRM-Outreach/1.0' } }, 10000)
    if (!r.ok) return null
    const html = await r.text()
    const mailto = html.match(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i)
    if (mailto) return mailto[1]
    const generic = html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
    if (generic && !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(generic[0])) return generic[0]
    return null
  } catch (e) {
    return null
  }
}

// Wordt aangeroepen zodra een e-mailadres bekend wordt voor een prospect (via
// findEmail) — checkt of dat adres al bij een andere prospect/pipeline-lead
// hoort. Overschrijft geen bestaande domein-gebaseerde markering.
async function flagEmailDuplicate(service, organizationId, prospectId, email) {
  if (!email) return
  const { data: prospect } = await service.from('outreach_prospects')
    .select('duplicate_prospect_id, duplicate_pipeline_id').eq('id', prospectId).single()
  if (prospect?.duplicate_prospect_id || prospect?.duplicate_pipeline_id) return

  const lower = email.toLowerCase()
  const { data: emailMatch } = await service.from('outreach_emails')
    .select('prospect_id, outreach_prospects!inner(organization_id)')
    .ilike('email', lower).neq('prospect_id', prospectId)
    .eq('outreach_prospects.organization_id', organizationId).limit(1).maybeSingle()
  if (emailMatch) {
    await service.from('outreach_prospects').update({ duplicate_prospect_id: emailMatch.prospect_id }).eq('id', prospectId)
    return
  }
  const { data: pipelineMatch } = await service.from('pipeline')
    .select('id').eq('organization_id', organizationId).ilike('email', lower).limit(1).maybeSingle()
  if (pipelineMatch) {
    await service.from('outreach_prospects').update({ duplicate_pipeline_id: pipelineMatch.id }).eq('id', prospectId)
  }
}

async function findEmail(service, body) {
  const organizationId = requireOrgId(body)
  const { prospectId } = body
  if (!prospectId) { const e = new Error('prospectId ontbreekt.'); e.status = 400; throw e }
  const { data: prospect, error: pErr } = await service.from('outreach_prospects').select('*').eq('id', prospectId).eq('organization_id', organizationId).single()
  if (pErr || !prospect) { const e = new Error('Prospect niet gevonden.'); e.status = 404; throw e }
  if (!prospect.website) {
    const { data: row } = await service.from('outreach_emails').insert([{ prospect_id: prospectId, email: null, confidence: 'missing', source: 'geen website bekend' }]).select().single()
    return { email: row }
  }

  const base = prospect.website.match(/^https?:\/\//i) ? prospect.website : `https://${prospect.website}`
  const candidates = [base, `${base.replace(/\/+$/, '')}/contact`, `${base.replace(/\/+$/, '')}/contact-us`, `${base.replace(/\/+$/, '')}/over-ons`]

  let found = null, foundOn = null
  for (const url of candidates) {
    found = await scanPageForEmail(url)
    if (found) { foundOn = url; break }
  }

  let email, confidence, source
  if (found) {
    email = found; confidence = 'found'; source = foundOn
  } else if (prospect.website_domain) {
    email = `info@${prospect.website_domain}`; confidence = 'guess'; source = 'patroon: info@domein'
  } else {
    email = null; confidence = 'missing'; source = 'geen e-mail gevonden en geen domein om te raden'
  }

  const { data: row, error } = await service.from('outreach_emails')
    .insert([{ prospect_id: prospectId, email, confidence, source }]).select().single()
  if (error) throw error
  if (email) await flagEmailDuplicate(service, organizationId, prospectId, email)
  return { email: row }
}

async function findEmailsBatch(service, body) {
  const organizationId = requireOrgId(body)
  const { data: prospects, error } = await service.from('outreach_prospects')
    .select('id').eq('organization_id', organizationId).eq('status', 'approved')
  if (error) throw error
  const { data: already } = await service.from('outreach_emails').select('prospect_id').in('prospect_id', prospects.map(p => p.id))
  const done = new Set((already || []).map(e => e.prospect_id))
  const todo = prospects.filter(p => !done.has(p.id))

  const results = []
  const batchSize = 3
  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(batch.map(p => findEmail(service, { organizationId, prospectId: p.id })))
    results.push(...batchResults)
  }
  return { checked: todo.length, failed: results.filter(r => r.status === 'rejected').length }
}

async function listEmails(service, q) {
  const organizationId = q.organizationId
  if (!organizationId) { const e = new Error('organizationId ontbreekt.'); e.status = 400; throw e }
  const { data, error } = await service.from('outreach_emails')
    .select('*, outreach_prospects!inner(id, name, sector, organization_id)')
    .eq('outreach_prospects.organization_id', organizationId).order('created_at', { ascending: false })
  if (error) throw error
  return { emails: data }
}

async function updateEmail(service, body) {
  const organizationId = requireOrgId(body)
  const { id, email, status } = body
  if (!id) { const e = new Error('id ontbreekt.'); e.status = 400; throw e }
  const { data: row, error: getErr } = await service.from('outreach_emails').select('*, outreach_prospects!inner(organization_id)').eq('id', id).single()
  if (getErr || !row || row.outreach_prospects.organization_id !== organizationId) { const e = new Error('E-mail niet gevonden.'); e.status = 404; throw e }
  const patch = {}
  if (email !== undefined) patch.email = email
  if (status !== undefined) patch.status = status
  const { error } = await service.from('outreach_emails').update(patch).eq('id', id)
  if (error) throw error
  return { ok: true }
}

// ─── Insights: funnel + breakdown + gecombineerde verzendlijst ─────────────
// Alleen flow-verzendingen (outreach_flow_sends) tellen mee in de funnel en
// de per-flow/per-sector-breakdown — dat is de enige plek met tracking. De
// oudere sjabloon-verzendingen (outreach_sends, Postmark) blijven zichtbaar
// in de gecombineerde lijst maar tonen "—" bij Geopend/Geklikt: ze zijn nooit
// gemeten, dus meetellen in de funnel zou de percentages vertekenen.
async function listInsights(service, q) {
  const organizationId = q.organizationId
  if (!organizationId) { const e = new Error('organizationId ontbreekt.'); e.status = 400; throw e }
  const period = q.period || '30'
  const sinceIso = period === '30' ? new Date(Date.now() - 30 * 86400000).toISOString()
    : period === '90' ? new Date(Date.now() - 90 * 86400000).toISOString() : null

  let flowQuery = service.from('outreach_flow_sends')
    .select('*, outreach_flows(name), outreach_prospects(name, sector)')
    .eq('organization_id', organizationId).order('sent_at', { ascending: false })
  if (sinceIso) flowQuery = flowQuery.gte('sent_at', sinceIso)
  const { data: flowSends, error: fsErr } = await flowQuery
  if (fsErr) throw fsErr

  let oldQuery = service.from('outreach_sends')
    .select('*, outreach_prospects(name)')
    .eq('organization_id', organizationId).not('sent_at', 'is', null).order('sent_at', { ascending: false })
  if (sinceIso) oldQuery = oldQuery.gte('sent_at', sinceIso)
  const { data: oldSends, error: osErr } = await oldQuery
  if (osErr) throw osErr

  const totals = { sent: flowSends.length, opened: 0, clicked: 0, replied: 0 }
  const byFlowMap = {}, bySectorMap = {}
  for (const r of flowSends) {
    const opened = !!r.opened_at, clicked = !!r.clicked_at, replied = !!r.replied_at
    if (opened) totals.opened++
    if (clicked) totals.clicked++
    if (replied) totals.replied++

    const flowKey = r.flow_id
    byFlowMap[flowKey] ||= { flow_id: flowKey, name: r.outreach_flows?.name || '—', sent: 0, opened: 0, clicked: 0, replied: 0 }
    byFlowMap[flowKey].sent++
    if (opened) byFlowMap[flowKey].opened++
    if (clicked) byFlowMap[flowKey].clicked++
    if (replied) byFlowMap[flowKey].replied++

    const sectorKey = r.outreach_prospects?.sector || 'Onbekend'
    bySectorMap[sectorKey] ||= { sector: sectorKey, sent: 0, opened: 0, clicked: 0, replied: 0 }
    bySectorMap[sectorKey].sent++
    if (opened) bySectorMap[sectorKey].opened++
    if (clicked) bySectorMap[sectorKey].clicked++
    if (replied) bySectorMap[sectorKey].replied++
  }

  const list = [
    ...flowSends.map(r => ({
      id: r.id, source: 'flow', prospect_name: r.outreach_prospects?.name || '—', subject: r.subject,
      sent_at: r.sent_at, opened_at: r.opened_at, clicked_at: r.clicked_at, replied_at: r.replied_at,
      flow_name: r.outreach_flows?.name || null, step_order: r.step_order,
    })),
    ...oldSends.map(r => ({
      id: r.id, source: 'template', prospect_name: r.outreach_prospects?.name || '—', subject: r.subject,
      sent_at: r.sent_at, opened_at: null, clicked_at: null, replied_at: r.replied_at, flow_name: null, step_order: null,
    })),
  ].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))

  return {
    period, totals,
    byFlow: Object.values(byFlowMap).sort((a, b) => b.sent - a.sent),
    bySector: Object.values(bySectorMap).sort((a, b) => b.sent - a.sent),
    list,
  }
}

// ─── Gmail OAuth + verzenden ────────────────────────────────────────────────
// outreach_gmail_tokens heeft BEWUST geen RLS-policies (zie migratie) — deze
// functies zijn de ENIGE plek die de tabel mag aanraken, altijd via de
// service-role client. Nooit rechtstreeks vanuit db.js/de browser benaderen.

function base64url(str) {
  return Buffer.from(str, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function gmailOAuthExchange(service, body) {
  const organizationId = requireOrgId(body)
  const { code, redirectUri } = body
  if (!code || !redirectUri) { const e = new Error('code en redirectUri zijn verplicht.'); e.status = 400; throw e }
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    const e = new Error('GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET zijn niet ingesteld.')
    e.status = 400; throw e
  }

  const tokenRes = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, redirect_uri: redirectUri, grant_type: 'authorization_code',
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    }),
  }, 15000)
  const tokens = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok) { const e = new Error(`Google gaf een fout bij het koppelen: ${tokens.error_description || tokens.error || tokenRes.status}`); e.status = 400; throw e }
  if (!tokens.refresh_token) {
    const e = new Error('Geen refresh-token ontvangen — Google geeft die alleen bij de eerste koppeling. Trek de toegang in bij myaccount.google.com/permissions en probeer opnieuw.')
    e.status = 400; throw e
  }

  const profileRes = await fetchWithTimeout('https://www.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  }, 10000)
  const profile = await profileRes.json().catch(() => ({}))

  const { error } = await service.from('outreach_gmail_tokens').upsert([{
    organization_id: organizationId, gmail_email: profile.emailAddress || 'onbekend',
    access_token: tokens.access_token, refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }])
  if (error) throw error
  // Meteen de watch() instellen i.p.v. te wachten op de volgende dagelijkse
  // cron-run — anders worden replies pas tot 24 uur na het koppelen gezien.
  await ensureGmailWatch(service, organizationId).catch(() => {})
  return { ok: true, gmailEmail: profile.emailAddress }
}

async function gmailDisconnect(service, body) {
  const organizationId = requireOrgId(body)
  const { error } = await service.from('outreach_gmail_tokens').delete().eq('organization_id', organizationId)
  if (error) throw error
  return { ok: true }
}

async function gmailStatus(service, q) {
  const organizationId = q.organizationId
  if (!organizationId) { const e = new Error('organizationId ontbreekt.'); e.status = 400; throw e }
  const { data } = await service.from('outreach_gmail_tokens').select('gmail_email, watch_expires_at').eq('organization_id', organizationId).maybeSingle()
  return { connected: !!data, gmailEmail: data?.gmail_email || null }
}

// Geeft een geldig access token terug, ververst 'm eerst als hij bijna verloopt.
async function getGmailAccessToken(service, organizationId) {
  const { data: row, error } = await service.from('outreach_gmail_tokens').select('*').eq('organization_id', organizationId).maybeSingle()
  if (error) throw error
  if (!row) { const e = new Error('Gmail is nog niet gekoppeld — regel dit bij Team.'); e.status = 400; throw e }

  if (new Date(row.expires_at).getTime() > Date.now() + 60000) return row

  const r = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: row.refresh_token, grant_type: 'refresh_token',
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    }),
  }, 15000)
  const tokens = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(`Gmail-token vernieuwen mislukt: ${tokens.error_description || tokens.error}`); e.status = 502; throw e }

  const patch = { access_token: tokens.access_token, expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }
  await service.from('outreach_gmail_tokens').update(patch).eq('organization_id', organizationId)
  return { ...row, ...patch }
}

function buildRawEmail({ from, to, subject, body, htmlBody, threadSubjectPrefix }) {
  const finalSubject = threadSubjectPrefix && !/^re:/i.test(subject) ? `Re: ${subject}` : subject
  if (!htmlBody) {
    const lines = [
      `From: ${from}`, `To: ${to}`, `Subject: ${finalSubject}`,
      'Content-Type: text/plain; charset="UTF-8"', 'MIME-Version: 1.0', '', body,
    ]
    return base64url(lines.join('\r\n'))
  }
  // multipart/alternative: de plain-text-versie bevat de originele, ongewijzigde
  // links (schoon voor spamfilters en voor clients die geen HTML tonen); alleen
  // de HTML-versie krijgt de tracking-pixel en herschreven klik-links, want
  // vrijwel elke mailclient rendert bij multipart/alternative de HTML-versie.
  const boundary = `bnd_${crypto.randomBytes(12).toString('hex')}`
  const lines = [
    `From: ${from}`, `To: ${to}`, `Subject: ${finalSubject}`,
    'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', '', body, '',
    `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', '', htmlBody, '',
    `--${boundary}--`,
  ]
  return base64url(lines.join('\r\n'))
}

async function sendViaGmail(service, organizationId, { to, subject, body, htmlBody, gmailThreadId }) {
  const token = await getGmailAccessToken(service, organizationId)
  const raw = buildRawEmail({ from: token.gmail_email, to, subject, body, htmlBody, threadSubjectPrefix: !!gmailThreadId })
  const payload = { raw }
  if (gmailThreadId) payload.threadId = gmailThreadId

  const r = await fetchWithTimeout('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 15000)
  const data = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(`Gmail gaf een fout: ${data.error?.message || r.status}`); e.status = 502; throw e }
  return { gmailMessageId: data.id, gmailThreadId: data.threadId }
}

// ─── Open-/klik-tracking voor flow-verzendingen ────────────────────────────

function appBaseUrl() {
  const url = process.env.APP_BASE_URL
  if (!url) { const e = new Error('APP_BASE_URL is niet ingesteld — nodig om tracking-links in verzonden mails op te bouwen.'); e.status = 500; throw e }
  return url.replace(/\/+$/, '')
}

function makeTrackingToken() {
  return crypto.randomBytes(20).toString('hex')
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// step.body is sinds de rich-text-editor al echte HTML (bold/lijsten/links/
// afbeeldingen). Hier hoeven we alleen nog: elke http(s)-link uit een
// href-attribuut herschrijven naar een klik-redirect, plus een onzichtbare
// 1x1-pixel aan het eind — geen escaping/br-conversie meer nodig, dat deed
// de editor al bij het opslaan.
function buildTrackedHtmlBody(bodyHtml, token) {
  const base = `${appBaseUrl()}/api/outreach`
  const html = bodyHtml.replace(/href="(https?:[^"]+)"/g, (m, url) =>
    `href="${base}?track_click=1&id=${token}&url=${encodeURIComponent(url)}"`)
  return html + `<img src="${base}?track_open=1&id=${token}" width="1" height="1" alt="" style="display:none">`
}

// Platte-tekst-fallback (voor de text/plain MIME-alternative) uit de HTML
// van de rich-text-editor — geen volwaardige HTML-parser nodig voor dit doel.
function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function ensureGmailWatch(service, organizationId) {
  if (!process.env.GMAIL_PUBSUB_TOPIC) return
  const { data: row } = await service.from('outreach_gmail_tokens').select('watch_expires_at').eq('organization_id', organizationId).maybeSingle()
  if (row?.watch_expires_at && new Date(row.watch_expires_at).getTime() > Date.now() + 2 * 86400000) return // nog >2 dagen geldig

  const token = await getGmailAccessToken(service, organizationId)
  const r = await fetchWithTimeout('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicName: process.env.GMAIL_PUBSUB_TOPIC, labelIds: ['INBOX'] }),
  }, 15000)
  const data = await r.json().catch(() => ({}))
  if (!r.ok || !data.expiration) return // best-effort — volgende cron-run probeert het opnieuw
  await service.from('outreach_gmail_tokens').update({
    watch_expires_at: new Date(Number(data.expiration)).toISOString(),
    last_history_id: row?.last_history_id || String(data.historyId || ''),
  }).eq('organization_id', organizationId)
}

// ─── Flows: sector-onafhankelijke stappenreeksen ───────────────────────────

async function listFlows(service, q) {
  const organizationId = q.organizationId
  if (!organizationId) { const e = new Error('organizationId ontbreekt.'); e.status = 400; throw e }
  const { data: flows, error } = await service.from('outreach_flows').select('*, outreach_flow_steps(*)').eq('organization_id', organizationId).order('created_at')
  if (error) throw error
  flows.forEach(f => f.outreach_flow_steps.sort((a, b) => a.step_order - b.step_order))
  return { flows }
}

async function saveFlow(service, body) {
  const organizationId = requireOrgId(body)
  const { id, name, is_active, steps } = body
  if (!name || !Array.isArray(steps) || !steps.length) { const e = new Error('Naam en minstens 1 stap zijn verplicht.'); e.status = 400; throw e }
  if (steps.length > 5) { const e = new Error('Maximaal 5 stappen per flow.'); e.status = 400; throw e }

  let flowId = id
  if (flowId) {
    const { error } = await service.from('outreach_flows').update({ name, is_active }).eq('id', flowId).eq('organization_id', organizationId)
    if (error) throw error
    await service.from('outreach_flow_steps').delete().eq('flow_id', flowId)
  } else {
    const { data, error } = await service.from('outreach_flows').insert([{ organization_id: organizationId, name, is_active: is_active !== false }]).select().single()
    if (error) throw error
    flowId = data.id
  }

  // Condities verwijzen naar een ANDERE stap in dezelfde flow via een 0-based
  // index in de "steps"-array van de client — die stap heeft nog geen echte
  // id totdat we 'm hebben ge-insert. Vandaar twee fases: eerst alle stappen
  // zonder condities wegschrijven, dan de condities alsnog invullen nu de
  // echte id's bekend zijn.
  const stepRows = steps.map((s, i) => ({
    flow_id: flowId, step_order: i + 1, subject: s.subject, body: s.body,
    wait_days_after_previous: i === 0 ? 0 : (s.wait_days_after_previous || 0),
    canvas_x: s.canvas_x ?? null, canvas_y: s.canvas_y ?? null,
  }))
  const { data: inserted, error: stepErr } = await service.from('outreach_flow_steps').insert(stepRows).select()
  if (stepErr) throw stepErr

  const idByOrder = Object.fromEntries(inserted.map(r => [r.step_order, r.id]))
  const updates = steps.map((s, i) => {
    const onReply = s.on_reply || {}
    const onNoReply = s.on_no_reply || {}
    return {
      id: idByOrder[i + 1],
      on_reply_next_step_id: Number.isInteger(onReply.targetIndex) ? idByOrder[onReply.targetIndex + 1] || null : null,
      on_reply_stop: !!onReply.stop,
      on_no_reply_next_step_id: Number.isInteger(onNoReply.targetIndex) ? idByOrder[onNoReply.targetIndex + 1] || null : null,
      on_no_reply_stop: !!onNoReply.stop,
    }
  }).filter(u => u.on_reply_next_step_id || u.on_reply_stop || u.on_no_reply_next_step_id || u.on_no_reply_stop)

  for (const u of updates) {
    const { id: rowId, ...patch } = u
    await service.from('outreach_flow_steps').update(patch).eq('id', rowId)
  }
  return { ok: true, flowId }
}

async function deleteFlow(service, body) {
  const organizationId = requireOrgId(body)
  const { id } = body
  if (!id) { const e = new Error('id ontbreekt.'); e.status = 400; throw e }
  const { error } = await service.from('outreach_flows').delete().eq('id', id).eq('organization_id', organizationId)
  if (error) throw error
  return { ok: true }
}

// ─── Flow-toewijzing + goedkeuringswachtrij ────────────────────────────────

async function startFlow(service, body) {
  const organizationId = requireOrgId(body)
  const { prospectId, emailId, flowId } = body
  if (!prospectId || !emailId || !flowId) { const e = new Error('prospectId, emailId en flowId zijn verplicht.'); e.status = 400; throw e }
  const { data, error } = await service.from('outreach_flow_state').insert([{
    organization_id: organizationId, prospect_id: prospectId, email_id: emailId, flow_id: flowId,
    current_step: 1, status: 'scheduled', scheduled_send_at: new Date().toISOString(),
  }]).select().single()
  if (error) throw error
  return { flowState: data }
}

async function listFlowQueue(service, q) {
  const organizationId = q.organizationId
  if (!organizationId) { const e = new Error('organizationId ontbreekt.'); e.status = 400; throw e }
  const filter = q.filter || 'due' // 'due' | 'upcoming' | 'done'
  const nowIso = new Date().toISOString()

  let query = service.from('outreach_flow_state')
    .select('*, outreach_prospects(id, name, sector, address), outreach_emails(email), outreach_flows(name, outreach_flow_steps(*))')
    .eq('organization_id', organizationId)

  if (filter === 'done') {
    query = query.in('status', ['completed', 'stopped']).order('updated_at', { ascending: false })
  } else if (filter === 'upcoming') {
    query = query.eq('status', 'scheduled').gt('scheduled_send_at', nowIso).order('scheduled_send_at')
  } else {
    query = query.in('status', ['scheduled', 'queued']).lte('scheduled_send_at', nowIso).order('scheduled_send_at')
  }

  const { data, error } = await query
  if (error) throw error

  const withPreview = data.map(fs => {
    const step = fs.outreach_flows.outreach_flow_steps.find(s => s.step_order === fs.current_step)
    const ctx = { name: fs.outreach_prospects.name, city: guessCity(fs.outreach_prospects.address), sector: fs.outreach_prospects.sector }
    return {
      ...fs,
      stepPreview: step ? { subject: renderTemplate(step.subject, ctx), body: renderTemplate(step.body, ctx), isLastStep: !fs.outreach_flows.outreach_flow_steps.some(s => s.step_order === fs.current_step + 1) } : null,
    }
  })
  return { queue: withPreview }
}

// Overzicht per flow: welke prospects zitten waar, ongeacht status/datum —
// i.t.t. listFlowQueue (die is voor Taken en filtert op due/upcoming/done).
async function listFlowProgress(service, q) {
  const organizationId = q.organizationId
  const flowId = q.flowId
  if (!organizationId || !flowId) { const e = new Error('organizationId en flowId zijn verplicht.'); e.status = 400; throw e }
  const { data, error } = await service.from('outreach_flow_state')
    .select('*, outreach_prospects(id, name, sector), outreach_emails(email)')
    .eq('organization_id', organizationId).eq('flow_id', flowId)
    .order('current_step').order('scheduled_send_at')
  if (error) throw error
  return { progress: data }
}

async function getDailySendCount(service, organizationId) {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const { count } = await service.from('outreach_flow_state').select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId).gte('last_sent_at', startOfDay.toISOString())
  return count || 0
}

async function getDailyLimit(service, organizationId) {
  const { data } = await service.from('company_settings').select('outreach_daily_send_limit').eq('organization_id', organizationId).maybeSingle()
  return data?.outreach_daily_send_limit || 30
}

// viaReply=false (na goedkeuren/overslaan): volgt on_no_reply_* — niet
// geconfigureerd (NULL/false) = default = gewoon naar de eerstvolgende stap,
// exact het oude lineaire gedrag.
// viaReply=true (na een gedetecteerde reply): volgt on_reply_* — niet
// geconfigureerd = default = flow stopt, exact het oude (niet-instelbare) gedrag.
async function advanceOrCompleteFlow(service, flowState, steps, { sent, viaReply }) {
  const currentStepRow = steps.find(s => s.step_order === flowState.current_step)
  const patch = { updated_at: new Date().toISOString() }
  if (sent) patch.last_sent_at = new Date().toISOString()

  let nextStep = null
  let stop = false
  if (currentStepRow) {
    if (viaReply) {
      if (currentStepRow.on_reply_stop) stop = true
      else if (currentStepRow.on_reply_next_step_id) nextStep = steps.find(s => s.id === currentStepRow.on_reply_next_step_id)
      else stop = true
    } else {
      if (currentStepRow.on_no_reply_stop) stop = true
      else if (currentStepRow.on_no_reply_next_step_id) nextStep = steps.find(s => s.id === currentStepRow.on_no_reply_next_step_id)
      else nextStep = steps.find(s => s.step_order === flowState.current_step + 1)
    }
  }

  if (!stop && nextStep) {
    patch.current_step = nextStep.step_order
    patch.status = 'scheduled'
    patch.scheduled_send_at = new Date(Date.now() + nextStep.wait_days_after_previous * 86400000).toISOString()
  } else {
    patch.status = 'completed'
  }
  const { error } = await service.from('outreach_flow_state').update(patch).eq('id', flowState.id)
  if (error) throw error
  return { stopped: !(!stop && nextStep) }
}

// Reply → flow stopt (standaard- of expliciet ingesteld gedrag) = de
// prospect heeft zelf gereageerd en verdient nu persoonlijke opvolging.
// Maakt daarom automatisch een lead aan in de standaard-pipeline (eerste
// fase). converted_pipeline_id voorkomt dubbele leads bij een tweede flow
// of een dubbel binnengekomen reply-webhook.
async function convertProspectToPipelineLead(service, organizationId, prospect, email) {
  if (!prospect || prospect.converted_pipeline_id) return
  const { data: pipelines } = await service.from('pipelines')
    .select('id, is_default, pipeline_stages(id, sort_order, win_probability)').eq('workspace_id', organizationId).order('created_at')
  const pipeline = pipelines?.find(p => p.is_default) || pipelines?.[0]
  const stage = pipeline?.pipeline_stages?.slice().sort((a, b) => a.sort_order - b.sort_order)[0]
  if (!pipeline || !stage) return // geen pipeline ingericht — niets aan te koppelen

  const { data: lead, error } = await service.from('pipeline').insert([{
    organization_id: organizationId, pipeline_id: pipeline.id, stage_id: stage.id, win_probability: stage.win_probability,
    fname: '—', lname: '—', company: prospect.name, email: email || null, phone: prospect.phone || null, source: 'Outreach',
  }]).select().single()
  if (error) throw error
  await service.from('outreach_prospects').update({ converted_pipeline_id: lead.id }).eq('id', prospect.id)
}

async function approveFlowStep(service, body) {
  const organizationId = requireOrgId(body)
  const { flowStateId } = body
  if (!flowStateId) { const e = new Error('flowStateId ontbreekt.'); e.status = 400; throw e }

  const { data: fs, error } = await service.from('outreach_flow_state')
    .select('*, outreach_prospects(name, address, sector), outreach_emails(email), outreach_flows(outreach_flow_steps(*))')
    .eq('id', flowStateId).eq('organization_id', organizationId).single()
  if (error || !fs) { const e = new Error('Flow-stap niet gevonden.'); e.status = 404; throw e }
  const steps = fs.outreach_flows.outreach_flow_steps
  const step = steps.find(s => s.step_order === fs.current_step)
  if (!step) { const e = new Error('Stap niet gevonden in flow.'); e.status = 400; throw e }

  const dailyCount = await getDailySendCount(service, organizationId)
  const dailyLimit = await getDailyLimit(service, organizationId)
  if (dailyCount >= dailyLimit) {
    await service.from('outreach_flow_state').update({ status: 'queued', updated_at: new Date().toISOString() }).eq('id', flowStateId)
    return { queued: true, reason: `Dagelijkse limiet van ${dailyLimit} verzonden mails is bereikt — wordt automatisch verstuurd zodra er weer ruimte is.` }
  }

  const ctx = { name: fs.outreach_prospects.name, city: guessCity(fs.outreach_prospects.address), sector: fs.outreach_prospects.sector }
  const subject = renderTemplate(step.subject, ctx)
  const bodyHtml = renderTemplate(step.body, ctx)
  const trackingToken = makeTrackingToken()
  const htmlBody = buildTrackedHtmlBody(bodyHtml, trackingToken)
  const { gmailMessageId, gmailThreadId } = await sendViaGmail(service, organizationId, { to: fs.outreach_emails.email, subject, body: stripHtml(bodyHtml), htmlBody, gmailThreadId: fs.gmail_thread_id })
  if (!fs.gmail_thread_id) await service.from('outreach_flow_state').update({ gmail_thread_id: gmailThreadId }).eq('id', flowStateId)
  await service.from('outreach_flow_sends').insert([{
    organization_id: organizationId, flow_state_id: fs.id, flow_id: fs.flow_id, prospect_id: fs.prospect_id,
    step_order: fs.current_step, subject, gmail_message_id: gmailMessageId, tracking_token: trackingToken,
  }])

  await advanceOrCompleteFlow(service, fs, steps, { sent: true, viaReply: false })
  return { ok: true }
}

async function skipFlowStep(service, body) {
  const organizationId = requireOrgId(body)
  const { flowStateId } = body
  if (!flowStateId) { const e = new Error('flowStateId ontbreekt.'); e.status = 400; throw e }
  const { data: fs, error } = await service.from('outreach_flow_state')
    .select('*, outreach_flows(outreach_flow_steps(*))').eq('id', flowStateId).eq('organization_id', organizationId).single()
  if (error || !fs) { const e = new Error('Flow-stap niet gevonden.'); e.status = 404; throw e }
  await advanceOrCompleteFlow(service, fs, fs.outreach_flows.outreach_flow_steps, { sent: false, viaReply: false })
  return { ok: true }
}

async function stopFlow(service, body) {
  const organizationId = requireOrgId(body)
  const { flowStateId, reason } = body
  if (!flowStateId) { const e = new Error('flowStateId ontbreekt.'); e.status = 400; throw e }
  const { error } = await service.from('outreach_flow_state')
    .update({ status: 'stopped', stopped_reason: reason || null, updated_at: new Date().toISOString() })
    .eq('id', flowStateId).eq('organization_id', organizationId)
  if (error) throw error
  return { ok: true }
}

// Cron: verwerkt 'queued' stappen (goedgekeurd, wachtte op dagelijkse ruimte)
// en vernieuwt Gmail's watch() voor elke gekoppelde organisatie.
async function processFlowQueueAndWatch(service) {
  const { data: tokens } = await service.from('outreach_gmail_tokens').select('organization_id')
  for (const t of tokens || []) {
    await ensureGmailWatch(service, t.organization_id).catch(() => {})
  }

  const { data: queued, error } = await service.from('outreach_flow_state')
    .select('*, outreach_prospects(name, address, sector), outreach_emails(email), outreach_flows(outreach_flow_steps(*))')
    .eq('status', 'queued').order('updated_at')
  if (error) throw error

  let sent = 0, stillQueued = 0
  const byOrg = {}
  for (const fs of queued) (byOrg[fs.organization_id] ||= []).push(fs)

  for (const [organizationId, items] of Object.entries(byOrg)) {
    let dailyCount = await getDailySendCount(service, organizationId)
    const dailyLimit = await getDailyLimit(service, organizationId)
    for (const fs of items) {
      if (dailyCount >= dailyLimit) { stillQueued++; continue }
      try {
        const steps = fs.outreach_flows.outreach_flow_steps
        const step = steps.find(s => s.step_order === fs.current_step)
        const ctx = { name: fs.outreach_prospects.name, city: guessCity(fs.outreach_prospects.address), sector: fs.outreach_prospects.sector }
        const subject = renderTemplate(step.subject, ctx)
        const bodyHtml = renderTemplate(step.body, ctx)
        const trackingToken = makeTrackingToken()
        const htmlBody = buildTrackedHtmlBody(bodyHtml, trackingToken)
        const { gmailMessageId, gmailThreadId } = await sendViaGmail(service, organizationId, { to: fs.outreach_emails.email, subject, body: stripHtml(bodyHtml), htmlBody, gmailThreadId: fs.gmail_thread_id })
        if (!fs.gmail_thread_id) await service.from('outreach_flow_state').update({ gmail_thread_id: gmailThreadId }).eq('id', fs.id)
        await service.from('outreach_flow_sends').insert([{
          organization_id: organizationId, flow_state_id: fs.id, flow_id: fs.flow_id, prospect_id: fs.prospect_id,
          step_order: fs.current_step, subject, gmail_message_id: gmailMessageId, tracking_token: trackingToken,
        }])
        await advanceOrCompleteFlow(service, fs, steps, { sent: true, viaReply: false })
        dailyCount++; sent++
      } catch (e) { stillQueued++ }
    }
  }
  return { sent, stillQueued }
}

// ─── Gmail Pub/Sub inbound webhook: reply-detectie ─────────────────────────

async function handleGmailPubSub(service, payload) {
  const dataB64 = payload?.message?.data
  if (!dataB64) return { matched: false }
  const decoded = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf-8'))
  const { emailAddress, historyId } = decoded
  if (!emailAddress) return { matched: false }

  const { data: tokenRow } = await service.from('outreach_gmail_tokens').select('*').eq('gmail_email', emailAddress).maybeSingle()
  if (!tokenRow) return { matched: false }

  const token = await getGmailAccessToken(service, tokenRow.organization_id)
  const startId = tokenRow.last_history_id || historyId
  const r = await fetchWithTimeout(`https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${startId}&historyTypes=messageAdded`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  }, 15000)
  const data = await r.json().catch(() => ({}))
  await service.from('outreach_gmail_tokens').update({ last_history_id: String(historyId) }).eq('organization_id', tokenRow.organization_id)
  if (!r.ok) return { matched: false }

  const threadIds = new Set()
  for (const h of data.history || []) {
    for (const m of h.messagesAdded || []) {
      if ((m.message.labelIds || []).includes('INBOX')) threadIds.add(m.message.threadId)
    }
  }
  if (!threadIds.size) return { matched: false }

  const { data: matches } = await service.from('outreach_flow_state')
    .select('*, outreach_flows(outreach_flow_steps(*)), outreach_prospects(*), outreach_emails(email)').eq('organization_id', tokenRow.organization_id)
    .in('gmail_thread_id', [...threadIds]).not('status', 'in', '(stopped,completed)')
  for (const fs of matches || []) {
    const repliedAt = new Date().toISOString()
    await service.from('outreach_flow_state').update({ replied_at: repliedAt }).eq('id', fs.id)
    // Zet ook replied_at op de outreach_flow_sends-rij van de stap die de reply
    // ving, voor de Insights-funnel — hergebruikt de bestaande match, geen nieuwe bouw.
    await service.from('outreach_flow_sends').update({ replied_at: repliedAt }).eq('flow_state_id', fs.id).eq('step_order', fs.current_step)
    // Volgt de on_reply_*-conditie van de huidige stap (default: flow stopt,
    // zelfde gedrag als voorheen) — zie advanceOrCompleteFlow.
    const { stopped } = await advanceOrCompleteFlow(service, fs, fs.outreach_flows.outreach_flow_steps, { sent: false, viaReply: true })
    // Stopt de flow door een reply? Dan verdient de prospect persoonlijke
    // opvolging — automatisch naar de pipeline, niet pas bij een volgende stap.
    if (stopped) await convertProspectToPipelineLead(service, tokenRow.organization_id, fs.outreach_prospects, fs.outreach_emails?.email)
  }
  return { matched: (matches || []).length > 0, count: (matches || []).length }
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

const RESOURCES = {
  prospects: listProspects, emails: listEmails,
  flows: listFlows, 'flow-queue': listFlowQueue, 'flow-progress': listFlowProgress, 'gmail-status': gmailStatus, insights: listInsights,
}
const ACTIONS = {
  'search-places': searchPlaces,
  'approve-prospect': updateProspectStatus,
  'set-prospects-sector': setProspectsSector,
  'delete-prospects': deleteProspects,
  'import-prospects-csv': importProspectsCsv,
  'find-email': findEmail,
  'find-emails-batch': findEmailsBatch,
  'update-email': updateEmail,
  'gmail-oauth-exchange': gmailOAuthExchange,
  'gmail-disconnect': gmailDisconnect,
  'save-flow': saveFlow,
  'delete-flow': deleteFlow,
  'start-flow': startFlow,
  'approve-flow-step': approveFlowStep,
  'skip-flow-step': skipFlowStep,
  'stop-flow': stopFlow,
}

// Transparante 1x1 GIF voor de open-tracking-pixel.
const TRACKING_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')

module.exports = async (req, res) => {
  try {
    // Open-/klik-tracking: aangeroepen door mailclients (img-src / link-klik),
    // dus geen sessie en geen apart secret — de token zelf is niet-raadbaar
    // en is de enige "auth". Faalt altijd stil door naar de gebruiker toe
    // (pixel/redirect moeten nooit een zichtbare fout tonen in de mail).
    if (req.method === 'GET' && req.query?.track_open === '1') {
      const token = req.query.id
      if (token) {
        const service = getServiceClient()
        service.from('outreach_flow_sends').select('id, opened_at, open_count').eq('tracking_token', token).maybeSingle()
          .then(({ data }) => {
            if (!data) return
            const patch = { open_count: (data.open_count || 0) + 1 }
            if (!data.opened_at) patch.opened_at = new Date().toISOString()
            return service.from('outreach_flow_sends').update(patch).eq('id', data.id)
          }).catch(() => {})
      }
      res.setHeader('Content-Type', 'image/gif')
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).send(TRACKING_GIF)
    }

    if (req.method === 'GET' && req.query?.track_click === '1') {
      const token = req.query.id
      const targetUrl = req.query.url
      if (token) {
        try {
          const service = getServiceClient()
          const { data } = await service.from('outreach_flow_sends').select('id, clicked_at, click_count').eq('tracking_token', token).maybeSingle()
          if (data) {
            const patch = { click_count: (data.click_count || 0) + 1 }
            if (!data.clicked_at) patch.clicked_at = new Date().toISOString()
            await service.from('outreach_flow_sends').update(patch).eq('id', data.id)
          }
        } catch (e) { /* redirect gaat altijd door, ook als loggen mislukt */ }
      }
      if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) return res.status(400).send('Ongeldige url')
      res.writeHead(302, { Location: targetUrl })
      return res.end()
    }

    // Gmail Pub/Sub push-subscription — zelfde aanpak: geheim in de query-string
    // i.p.v. Postmark-stijl auth, want ook hier is geen gebruikerssessie mogelijk.
    if (req.method === 'POST' && req.query?.gmail_pubsub === '1') {
      if (!process.env.GMAIL_PUBSUB_SECRET || req.query.secret !== process.env.GMAIL_PUBSUB_SECRET) {
        return res.status(403).json({ error: 'Ongeldig webhook secret.' })
      }
      const result = await handleGmailPubSub(getServiceClient(), req.body || {})
      return res.status(200).json(result)
    }

    // Vercel Cron: dagelijkse flow-wachtrij + Gmail watch()-vernieuwing.
    if (req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) {
      const service = getServiceClient()
      const flowQueue = await processFlowQueueAndWatch(service)
      return res.status(200).json({ flowQueue })
    }

    const { service } = await requireUser(req)

    if (req.method === 'GET') {
      const q = req.query || {}
      const handler = RESOURCES[q.resource]
      if (!handler) return res.status(400).json({ error: 'Onbekende resource.' })
      return res.status(200).json(await handler(service, q))
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const handler = ACTIONS[body.action]
      if (!handler) return res.status(400).json({ error: 'Onbekende action.' })
      return res.status(200).json(await handler(service, body))
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
