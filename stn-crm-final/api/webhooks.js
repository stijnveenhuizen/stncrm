// Eén verzamel-endpoint voor externe events die Contacten bijwerken. Twee
// soorten aanroepers delen dit bestand (Vercel Hobby-limiet: max 12 functions
// per deployment, zie api/admin.js voor hetzelfde patroon):
//  - Mailmeteor/Zapier (geen sessie mogelijk — geverifieerd via een per-
//    organisatie secret in de query-string, zie webhook_endpoints-tabel)
//  - Vercel Cron (Bearer CRON_SECRET, checkt de "inactivity"-automatiseringsregels)
//
// Alle logica (leadscore, status, taken) zit in de CRM — Zapier stuurt alleen
// het kale event door, wij bepalen wat ermee gebeurt.
const { getServiceClient } = require('./_shared')

const EVENT_LABELS = {
  EMAIL_SENT: 'Mail verstuurd',
  EMAIL_OPENED: 'Mail geopend',
  EMAIL_CLICKED: 'Klik op link',
  EMAIL_REPLIED: 'Gereageerd',
  EMAIL_BOUNCED: 'Mail gebounced',
  UNSUBSCRIBED: 'Uitgeschreven',
  CALL_COMPLETED: 'Gesprek gevoerd',
  MEETING_BOOKED: 'Afspraak gepland',
}

async function findOrCreateContact(service, organizationId, email) {
  const { data: existing, error: findErr } = await service.from('contacts')
    .select('*').eq('organization_id', organizationId).eq('email', email).maybeSingle()
  if (findErr) throw findErr
  if (existing) return existing

  const { data: created, error } = await service.from('contacts')
    .insert([{ organization_id: organizationId, email, status: 'NEW', source: 'mailmeteor' }])
    .select().single()
  if (error) throw error
  await service.from('contact_activities').insert([{
    organization_id: organizationId, contact_id: created.id, type: 'CONTACT_CREATED', title: 'Contact aangemaakt via Mailmeteor',
  }])
  return created
}

// Onbekende ruwe event-namen worden nooit stilzwijgend weggegooid — ze komen
// gewoon op de tijdlijn als "UNKNOWN:<ruwe naam>" zodat je ze alsnog kan
// mappen bij Instellingen zonder dat er events verloren gaan.
async function resolveCanonicalEvent(service, organizationId, externalKey) {
  if (!externalKey) return null
  const { data } = await service.from('event_type_aliases')
    .select('canonical_event').eq('organization_id', organizationId).eq('external_key', externalKey).maybeSingle()
  return data?.canonical_event || null
}

async function applyLeadscore(service, organizationId, contact, canonicalEvent) {
  if (!canonicalEvent) return 0
  const { data: rule } = await service.from('leadscore_rules')
    .select('points').eq('organization_id', organizationId).eq('event_type', canonicalEvent).eq('is_active', true).maybeSingle()
  return rule?.points || 0
}

async function applyEventAutomations(service, organizationId, contact, canonicalEvent) {
  if (!canonicalEvent) return { statusPatch: null }
  const { data: rules, error } = await service.from('automation_rules')
    .select('*').eq('organization_id', organizationId).eq('trigger_type', 'event').eq('trigger_event', canonicalEvent).eq('is_active', true)
  if (error) throw error

  let statusPatch = null
  for (const rule of rules || []) {
    if (rule.action_set_status) statusPatch = rule.action_set_status
    if (rule.action_create_task_title) {
      const deadline = rule.action_create_task_due_days != null
        ? new Date(Date.now() + rule.action_create_task_due_days * 86400000).toISOString().slice(0, 10) : null
      await service.from('contact_tasks').insert([{
        organization_id: organizationId, contact_id: contact.id, title: rule.action_create_task_title, deadline,
      }])
      await service.from('contact_activities').insert([{
        organization_id: organizationId, contact_id: contact.id, type: 'TASK_CREATED', title: `Taak aangemaakt: ${rule.action_create_task_title}`,
      }])
    }
  }
  return { statusPatch }
}

async function handleWebhookEvent(service, organizationId, body) {
  const { email, event, timestamp } = body || {}
  if (!email) { const e = new Error('email ontbreekt.'); e.status = 400; throw e }

  const contact = await findOrCreateContact(service, organizationId, email.toLowerCase().trim())
  const canonicalEvent = await resolveCanonicalEvent(service, organizationId, event)
  const activityType = canonicalEvent || `UNKNOWN:${event || 'onbekend'}`
  const title = EVENT_LABELS[canonicalEvent] || `Onbekend event: ${event || '—'}`

  await service.from('contact_activities').insert([{
    organization_id: organizationId, contact_id: contact.id, type: activityType, title,
    metadata: { raw_event: event || null, raw_timestamp: timestamp || null },
    created_at: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
  }])

  const points = await applyLeadscore(service, organizationId, contact, canonicalEvent)
  const { statusPatch } = await applyEventAutomations(service, organizationId, contact, canonicalEvent)

  const patch = { updated_at: new Date().toISOString() }
  if (points) patch.leadscore = (contact.leadscore || 0) + points
  if (statusPatch) patch.status = statusPatch
  if (Object.keys(patch).length > 1) await service.from('contacts').update(patch).eq('id', contact.id)

  return { ok: true, contactId: contact.id, canonicalEvent: canonicalEvent || null }
}

// Cron: checkt de "inactivity"-automatiseringsregels voor alle organisaties.
// Maakt geen dubbele taak aan als er al een open taak met dezelfde titel bestaat
// voor dat contact (anders krijg je elke dag een nieuwe "Follow-up bellen"-taak
// zolang het contact inactief blijft).
async function runInactivitySweep(service) {
  const { data: rules, error } = await service.from('automation_rules')
    .select('*').eq('trigger_type', 'inactivity').eq('is_active', true)
  if (error) throw error

  let created = 0, checked = 0
  for (const rule of rules || []) {
    const cutoff = new Date(Date.now() - rule.inactivity_days * 86400000).toISOString()
    const { data: staleContacts, error: cErr } = await service.from('contacts')
      .select('id, organization_id').eq('organization_id', rule.organization_id)
      .lt('last_activity_at', cutoff).not('status', 'in', '(CUSTOMER,ARCHIVED)')
    if (cErr) throw cErr
    checked += (staleContacts || []).length

    for (const contact of staleContacts || []) {
      if (!rule.action_create_task_title) continue
      const { data: existingTask } = await service.from('contact_tasks')
        .select('id').eq('contact_id', contact.id).eq('title', rule.action_create_task_title).eq('status', 'open').maybeSingle()
      if (existingTask) continue

      const deadline = rule.action_create_task_due_days != null
        ? new Date(Date.now() + rule.action_create_task_due_days * 86400000).toISOString().slice(0, 10) : null
      await service.from('contact_tasks').insert([{
        organization_id: contact.organization_id, contact_id: contact.id, title: rule.action_create_task_title, deadline,
      }])
      await service.from('contact_activities').insert([{
        organization_id: contact.organization_id, contact_id: contact.id, type: 'TASK_CREATED',
        title: `Taak aangemaakt: ${rule.action_create_task_title}`, metadata: { reason: 'inactivity', inactivity_days: rule.inactivity_days },
      }])
      created++
    }
  }
  return { checked, created }
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST' && req.query?.org) {
      const organizationId = req.query.org
      const source = req.query.source || 'mailmeteor'
      const { data: endpoint } = await getServiceClient().from('webhook_endpoints')
        .select('secret').eq('organization_id', organizationId).eq('source', source).maybeSingle()
      if (!endpoint || req.query.secret !== endpoint.secret) {
        return res.status(403).json({ error: 'Ongeldig webhook secret.' })
      }
      const result = await handleWebhookEvent(getServiceClient(), organizationId, req.body || {})
      return res.status(200).json(result)
    }

    if (req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`) {
      const result = await runInactivitySweep(getServiceClient())
      return res.status(200).json(result)
    }

    return res.status(404).json({ error: 'Onbekende aanroep.' })
  } catch (e) {
    console.error('webhooks error:', e)
    return res.status(e.status || 500).json({ error: e.message || 'Interne fout.' })
  }
}
