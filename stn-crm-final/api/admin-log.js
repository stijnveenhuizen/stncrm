// Verzamelt event- en error-logging in één bestand (budget: Vercel Hobby max 12
// functions). type in de body kiest de tak — de twee takken hebben BEWUST een
// verschillend beveiligingsmodel, dus behandel ze niet hetzelfde:
//  - 'event': vereist een geldige ingelogde gebruiker (requireUser)
//  - 'error': geen gate — moet ook fouten kunnen loggen vóórdat er een sessie is
const { requireUser, getServiceClient } = require('./_shared')

function anonymizeIp(ip) {
  if (!ip) return null
  const first = ip.split(',')[0].trim()
  if (first.includes('.')) return first.replace(/\.\d+$/, '.0')
  if (first.includes(':')) return first.replace(/:[0-9a-f]*$/i, ':0')
  return first
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { type } = req.body || {}

  if (type === 'event') {
    try {
      const { service, user } = await requireUser(req)
      const { eventType, eventName, metadata, workspaceId } = req.body || {}
      if (!eventType || !eventName) return res.status(400).json({ error: 'eventType/eventName ontbreekt.' })
      await service.from('admin_events').insert([{
        user_id: user.id, workspace_id: workspaceId || null,
        event_type: eventType, event_name: eventName, metadata: metadata || {},
        ip_address: anonymizeIp(req.headers['x-forwarded-for'] || req.socket?.remoteAddress),
        user_agent: (req.headers['user-agent'] || '').slice(0, 300),
      }])
      return res.status(200).json({ ok: true })
    } catch (e) {
      // Loggen mag de eigenlijke actie van de gebruiker nooit blokkeren.
      return res.status(200).json({ ok: false })
    }
  }

  if (type === 'error') {
    try {
      const { message, stack, route, userId, workspaceId } = req.body || {}
      if (!message) return res.status(400).json({ error: 'message ontbreekt.' })
      const service = getServiceClient()
      await service.from('system_errors').insert([{
        user_id: userId || null, workspace_id: workspaceId || null,
        error_message: String(message).slice(0, 2000), error_stack: stack ? String(stack).slice(0, 8000) : null,
        route: route || null,
      }])
      return res.status(200).json({ ok: true })
    } catch (e) {
      return res.status(200).json({ ok: false })
    }
  }

  return res.status(400).json({ error: 'Onbekend type.' })
}
