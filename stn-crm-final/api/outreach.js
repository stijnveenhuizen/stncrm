// Eén verzamel-endpoint voor de hele Outreach-module (Vercel Hobby-limiet: max
// 12 functions per deployment — zie api/admin.js/api/admin-write.js voor
// hetzelfde patroon). Drie soorten aanroepers delen dit bestand:
//  - de app zelf (Bearer-sessie, GET ?resource=... / POST { action })
//  - Vercel Cron (Bearer CRON_SECRET, verstuurt vervallen follow-ups)
//  - Postmark's inbound-webhook (geen sessie mogelijk — geverifieerd via een
//    geheime query-param, zie POSTMARK_WEBHOOK_SECRET)
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

// ─── Sector-sjablonen ───────────────────────────────────────────────────────

async function listTemplates(service, q) {
  const organizationId = q.organizationId
  if (!organizationId) { const e = new Error('organizationId ontbreekt.'); e.status = 400; throw e }
  const { data, error } = await service.from('outreach_templates').select('*').eq('organization_id', organizationId).order('sector')
  if (error) throw error
  return { templates: data }
}

async function saveTemplate(service, body) {
  const organizationId = requireOrgId(body)
  const { id, sector, subject, template_body, follow_up_subject, follow_up_body, follow_up_wait_days } = body
  if (!sector || !subject || !template_body) { const e = new Error('Sector, onderwerp en tekst zijn verplicht.'); e.status = 400; throw e }
  const payload = {
    organization_id: organizationId, sector, subject, body: template_body,
    follow_up_subject: follow_up_subject || null, follow_up_body: follow_up_body || null,
    follow_up_wait_days: follow_up_wait_days || 5, updated_at: new Date().toISOString(),
  }
  if (id) {
    const { error } = await service.from('outreach_templates').update(payload).eq('id', id).eq('organization_id', organizationId)
    if (error) throw error
    return { ok: true }
  }
  const { data, error } = await service.from('outreach_templates').insert([payload]).select().single()
  if (error) throw error
  return { template: data }
}

async function deleteTemplate(service, body) {
  const organizationId = requireOrgId(body)
  const { id } = body
  if (!id) { const e = new Error('id ontbreekt.'); e.status = 400; throw e }
  const { error } = await service.from('outreach_templates').delete().eq('id', id).eq('organization_id', organizationId)
  if (error) throw error
  return { ok: true }
}

// ─── Goedkeuring + verzending ───────────────────────────────────────────────

const UNDO_WINDOW_SECONDS = 60

async function scheduleSend(service, body) {
  const organizationId = requireOrgId(body)
  const { prospectId, emailId } = body
  if (!prospectId || !emailId) { const e = new Error('prospectId en emailId zijn verplicht.'); e.status = 400; throw e }

  const { data: prospect, error: pErr } = await service.from('outreach_prospects').select('*').eq('id', prospectId).eq('organization_id', organizationId).single()
  if (pErr || !prospect) { const e = new Error('Prospect niet gevonden.'); e.status = 404; throw e }
  const { data: emailRow, error: eErr } = await service.from('outreach_emails').select('*').eq('id', emailId).eq('prospect_id', prospectId).single()
  if (eErr || !emailRow || !emailRow.email) { const e = new Error('Geen geldig e-mailadres voor deze prospect.'); e.status = 400; throw e }

  const { data: template, error: tErr } = await service.from('outreach_templates')
    .select('*').eq('organization_id', organizationId).ilike('sector', prospect.sector || '').maybeSingle()
  if (tErr) throw tErr
  if (!template) {
    const e = new Error(`Geen sjabloon voor sector "${prospect.sector || 'onbekend'}" — maak er eerst een aan bij Sjablonen.`)
    e.status = 400; throw e
  }

  const ctx = { name: prospect.name, city: guessCity(prospect.address), sector: prospect.sector }
  const subject = renderTemplate(template.subject, ctx)
  const emailBody = renderTemplate(template.body, ctx)
  const followUpSubject = renderTemplate(template.follow_up_subject, ctx)
  const followUpBody = renderTemplate(template.follow_up_body, ctx)

  const sendAt = new Date(Date.now() + UNDO_WINDOW_SECONDS * 1000).toISOString()
  const { data: row, error } = await service.from('outreach_sends').insert([{
    organization_id: organizationId, prospect_id: prospectId, email_id: emailId, template_id: template.id,
    subject, body: emailBody, follow_up_subject: followUpSubject, follow_up_body: followUpBody,
    follow_up_wait_days: template.follow_up_wait_days, status: 'scheduled', send_at: sendAt,
  }]).select().single()
  if (error) throw error
  return { send: row, undoWindowSeconds: UNDO_WINDOW_SECONDS }
}

async function cancelSend(service, body) {
  const organizationId = requireOrgId(body)
  const { sendId } = body
  if (!sendId) { const e = new Error('sendId ontbreekt.'); e.status = 400; throw e }
  const { error } = await service.from('outreach_sends').update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', sendId).eq('organization_id', organizationId).eq('status', 'scheduled')
  if (error) throw error
  return { ok: true }
}

async function sendViaPostmark(to, subject, textBody, replyTo) {
  if (!process.env.POSTMARK_SERVER_TOKEN || !process.env.POSTMARK_FROM_EMAIL) {
    const e = new Error('POSTMARK_SERVER_TOKEN / POSTMARK_FROM_EMAIL zijn niet ingesteld — voeg deze toe in Vercel voordat je kunt versturen.')
    e.status = 400; throw e
  }
  const r = await fetchWithTimeout('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN },
    body: JSON.stringify({ From: process.env.POSTMARK_FROM_EMAIL, To: to, Subject: subject, TextBody: textBody, ReplyTo: replyTo || undefined, MessageStream: 'outbound' }),
  }, 15000)
  const data = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(`Postmark gaf een fout: ${data.Message || r.status}`); e.status = 502; throw e }
  return data.MessageID
}

async function confirmSend(service, body) {
  const organizationId = requireOrgId(body)
  const { sendId } = body
  if (!sendId) { const e = new Error('sendId ontbreekt.'); e.status = 400; throw e }
  const { data: send, error: sErr } = await service.from('outreach_sends')
    .select('*, outreach_emails(email)').eq('id', sendId).eq('organization_id', organizationId).single()
  if (sErr || !send) { const e = new Error('Verzending niet gevonden.'); e.status = 404; throw e }
  if (send.status !== 'scheduled') { const e = new Error('Deze verzending is al verstuurd of geannuleerd.'); e.status = 400; throw e }

  const messageId = await sendViaPostmark(send.outreach_emails.email, send.subject, send.body, process.env.POSTMARK_INBOUND_ADDRESS)
  const sentAt = new Date()
  const followUpScheduledAt = new Date(sentAt.getTime() + send.follow_up_wait_days * 86400000)
  const { error } = await service.from('outreach_sends').update({
    status: 'sent', sent_at: sentAt.toISOString(), postmark_message_id: messageId,
    follow_up_scheduled_at: send.follow_up_subject ? followUpScheduledAt.toISOString() : null,
  }).eq('id', sendId)
  if (error) throw error
  return { ok: true }
}

async function listSends(service, q) {
  const organizationId = q.organizationId
  if (!organizationId) { const e = new Error('organizationId ontbreekt.'); e.status = 400; throw e }
  const { data, error } = await service.from('outreach_sends')
    .select('*, outreach_prospects(id, name), outreach_emails(email)')
    .eq('organization_id', organizationId).order('created_at', { ascending: false })
  if (error) throw error
  return { sends: data }
}

// ─── Cron: vervallen follow-ups versturen ──────────────────────────────────

async function sendFollowups(service) {
  const { data: due, error } = await service.from('outreach_sends')
    .select('*, outreach_emails(email)').eq('status', 'sent').lte('follow_up_scheduled_at', new Date().toISOString())
  if (error) throw error

  let sent = 0, failed = 0
  const batchSize = 3
  for (let i = 0; i < due.length; i += batchSize) {
    const batch = due.slice(i, i + batchSize)
    await Promise.allSettled(batch.map(async send => {
      try {
        const messageId = await sendViaPostmark(send.outreach_emails.email, send.follow_up_subject, send.follow_up_body, process.env.POSTMARK_INBOUND_ADDRESS)
        await service.from('outreach_sends').update({ status: 'followed_up', follow_up_sent_at: new Date().toISOString(), follow_up_postmark_message_id: messageId }).eq('id', send.id)
        sent++
      } catch (e) { failed++ }
    }))
  }
  return { checked: due.length, sent, failed }
}

// ─── Postmark inbound webhook: reply-detectie ──────────────────────────────

async function handlePostmarkInbound(service, payload) {
  const fromEmail = (payload.FromFull?.Email || payload.From || '').toLowerCase().trim()
  const strippedReply = (payload.StrippedTextReply || '').trim()
  if (!fromEmail || !strippedReply) return { matched: false }

  const { data: candidates, error } = await service.from('outreach_sends')
    .select('*, outreach_emails!inner(email)').in('status', ['sent', 'followed_up'])
    .ilike('outreach_emails.email', fromEmail).order('sent_at', { ascending: false }).limit(1)
  if (error) throw error
  if (!candidates?.length) return { matched: false }

  const send = candidates[0]
  await service.from('outreach_sends').update({ status: 'replied', replied_at: new Date().toISOString() }).eq('id', send.id)
  return { matched: true, sendId: send.id }
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

function buildRawEmail({ from, to, subject, body, threadSubjectPrefix }) {
  const finalSubject = threadSubjectPrefix && !/^re:/i.test(subject) ? `Re: ${subject}` : subject
  const lines = [
    `From: ${from}`, `To: ${to}`, `Subject: ${finalSubject}`,
    'Content-Type: text/plain; charset="UTF-8"', 'MIME-Version: 1.0', '', body,
  ]
  return base64url(lines.join('\r\n'))
}

async function sendViaGmail(service, organizationId, { to, subject, body, gmailThreadId }) {
  const token = await getGmailAccessToken(service, organizationId)
  const raw = buildRawEmail({ from: token.gmail_email, to, subject, body, threadSubjectPrefix: !!gmailThreadId })
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
  const body_ = renderTemplate(step.body, ctx)
  const { gmailThreadId } = await sendViaGmail(service, organizationId, { to: fs.outreach_emails.email, subject, body: body_, gmailThreadId: fs.gmail_thread_id })
  if (!fs.gmail_thread_id) await service.from('outreach_flow_state').update({ gmail_thread_id: gmailThreadId }).eq('id', flowStateId)

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
        const body_ = renderTemplate(step.body, ctx)
        const { gmailThreadId } = await sendViaGmail(service, organizationId, { to: fs.outreach_emails.email, subject, body: body_, gmailThreadId: fs.gmail_thread_id })
        if (!fs.gmail_thread_id) await service.from('outreach_flow_state').update({ gmail_thread_id: gmailThreadId }).eq('id', fs.id)
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
    .select('*, outreach_flows(outreach_flow_steps(*))').eq('organization_id', tokenRow.organization_id)
    .in('gmail_thread_id', [...threadIds]).not('status', 'in', '(stopped,completed)')
  for (const fs of matches || []) {
    await service.from('outreach_flow_state').update({ replied_at: new Date().toISOString() }).eq('id', fs.id)
    // Volgt de on_reply_*-conditie van de huidige stap (default: flow stopt,
    // zelfde gedrag als voorheen) — zie advanceOrCompleteFlow.
    await advanceOrCompleteFlow(service, fs, fs.outreach_flows.outreach_flow_steps, { sent: false, viaReply: true })
  }
  return { matched: (matches || []).length > 0, count: (matches || []).length }
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

const RESOURCES = {
  prospects: listProspects, emails: listEmails, templates: listTemplates, sends: listSends,
  flows: listFlows, 'flow-queue': listFlowQueue, 'gmail-status': gmailStatus,
}
const ACTIONS = {
  'search-places': searchPlaces,
  'approve-prospect': updateProspectStatus,
  'find-email': findEmail,
  'find-emails-batch': findEmailsBatch,
  'update-email': updateEmail,
  'save-template': saveTemplate,
  'delete-template': deleteTemplate,
  'schedule-send': scheduleSend,
  'cancel-send': cancelSend,
  'confirm-send': confirmSend,
  'gmail-oauth-exchange': gmailOAuthExchange,
  'gmail-disconnect': gmailDisconnect,
  'save-flow': saveFlow,
  'delete-flow': deleteFlow,
  'start-flow': startFlow,
  'approve-flow-step': approveFlowStep,
  'skip-flow-step': skipFlowStep,
  'stop-flow': stopFlow,
}

module.exports = async (req, res) => {
  try {
    // Postmark's inbound-webhook heeft geen sessie — geverifieerd via een
    // geheim query-param dat alleen in de bij Postmark geregistreerde URL staat.
    if (req.method === 'POST' && req.query?.postmark === '1') {
      if (!process.env.POSTMARK_WEBHOOK_SECRET || req.query.secret !== process.env.POSTMARK_WEBHOOK_SECRET) {
        return res.status(403).json({ error: 'Ongeldig webhook secret.' })
      }
      const result = await handlePostmarkInbound(getServiceClient(), req.body || {})
      return res.status(200).json(result)
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

    // Vercel Cron: dagelijkse follow-up verzending + flow-wachtrij + Gmail watch()-vernieuwing.
    if (req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) {
      const service = getServiceClient()
      const [followups, flowQueue] = await Promise.all([sendFollowups(service), processFlowQueueAndWatch(service)])
      return res.status(200).json({ followups, flowQueue })
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
