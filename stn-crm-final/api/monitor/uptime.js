const { requireUser } = require('../_shared')
const { checkUptime, checkSSL, normalizeUrl } = require('./_lib')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireUser(req)
    const { siteId } = req.body || {}
    if (!siteId) return res.status(400).json({ error: 'siteId ontbreekt.' })

    const { data: site, error: siteErr } = await service.from('hosting').select('*').eq('id', siteId).single()
    if (siteErr || !site) return res.status(404).json({ error: 'Site niet gevonden.' })
    if (!site.url) return res.status(400).json({ error: 'Deze site heeft geen URL ingesteld.' })

    const uptime = await checkUptime(site.url)
    let hostname
    try { hostname = new URL(normalizeUrl(site.url)).hostname } catch (e) { hostname = site.domain }
    const ssl = hostname ? await checkSSL(hostname) : { valid: null, expiresAt: null }

    const { data: check, error } = await service.from('website_checks').insert([{
      site_id: siteId, is_online: uptime.isOnline, response_time_ms: uptime.responseTimeMs,
      ssl_valid: ssl.valid, ssl_expires_at: ssl.expiresAt ? new Date(ssl.expiresAt).toISOString().slice(0, 10) : null,
    }]).select().single()
    if (error) throw error

    res.status(200).json({ check })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
