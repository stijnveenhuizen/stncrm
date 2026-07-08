const { requireUser } = require('./_shared')

// Laatste octet van het IP-adres vervangen door 0 — genoeg voor grove
// locatie/abuse-analyse zonder een individuele bezoeker herleidbaar op te slaan.
function anonymizeIp(ip) {
  if (!ip) return null
  const first = ip.split(',')[0].trim()
  if (first.includes('.')) return first.replace(/\.\d+$/, '.0')
  if (first.includes(':')) return first.replace(/:[0-9a-f]*$/i, ':0') // ruwe IPv6-variant
  return first
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
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
    res.status(200).json({ ok: true })
  } catch (e) {
    // Loggen mag de eigenlijke actie van de gebruiker nooit blokkeren.
    res.status(200).json({ ok: false })
  }
}
