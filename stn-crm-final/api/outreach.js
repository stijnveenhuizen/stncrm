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

// ─── Dispatch ───────────────────────────────────────────────────────────────

const RESOURCES = { prospects: listProspects, emails: listEmails, templates: listTemplates, sends: listSends }
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

    // Vercel Cron: dagelijkse follow-up verzending.
    if (req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) {
      const result = await sendFollowups(getServiceClient())
      return res.status(200).json(result)
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
