const { getServiceClient, requireUser } = require('../_shared')
const { checkUptime, checkSSL, sniffWordPress } = require('./_lib')

// Best-effort: vraagt de publieke wordpress.org plugin-API (geen key nodig) om de
// nieuwste versie van een gedetecteerde plugin-slug, en vergelijkt die met wat er
// op de site draait. Werkt alleen voor plugins uit de officiële WordPress-
// directory; premium/maatwerk plugins worden overgeslagen (geen vergelijking
// mogelijk zonder hun eigen update-server te kennen).
async function pluginHasUpdate(slug, currentVersion) {
  if (!currentVersion) return false
  try {
    const res = await fetch(`https://api.wordpress.org/plugins/info/1.0/${slug}.json`)
    if (!res.ok) return false
    const data = await res.json()
    if (!data || !data.version) return false
    return data.version !== currentVersion
  } catch (e) { return false }
}

async function checkOneSite(service, site) {
  const result = { is_online: false, response_time_ms: null, ssl_valid: null, ssl_expires_at: null, pagespeed_mobile: null, pagespeed_desktop: null, wp_version: null, php_version: null }
  if (!site.url) return result

  const uptime = await checkUptime(site.url)
  result.is_online = uptime.isOnline
  result.response_time_ms = uptime.responseTimeMs

  let hostname
  try { hostname = new URL(site.url).hostname } catch (e) { hostname = site.domain }
  if (hostname) {
    const ssl = await checkSSL(hostname)
    result.ssl_valid = ssl.valid
    result.ssl_expires_at = ssl.expiresAt ? new Date(ssl.expiresAt).toISOString().slice(0, 10) : null
  }

  if (uptime.isOnline) {
    const wp = await sniffWordPress(site.url)
    result.wp_version = wp.wpVersion
    result.php_version = wp.phpVersion
    if (wp.plugins.length) {
      for (const p of wp.plugins) {
        const hasUpdate = await pluginHasUpdate(p.name, p.version)
        await service.from('website_plugins').upsert(
          { site_id: site.id, name: p.name, version: p.version, has_update: hasUpdate, last_checked_at: new Date().toISOString() },
          { onConflict: 'site_id,name' }
        ).catch(() => {})
      }
    }
  }

  const key = process.env.PAGESPEED_API_KEY ? `&key=${process.env.PAGESPEED_API_KEY}` : ''
  for (const strategy of ['mobile', 'desktop']) {
    try {
      const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(site.pagespeed_url || site.url)}&strategy=${strategy}${key}`)
      if (r.ok) {
        const data = await r.json()
        const score = data?.lighthouseResult?.categories?.performance?.score
        if (typeof score === 'number') result[`pagespeed_${strategy}`] = Math.round(score * 100)
      }
    } catch (e) { /* pagespeed is best-effort, mag de rest niet blokkeren */ }
  }

  await service.from('website_checks').insert([{ site_id: site.id, ...result }])
  return result
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const isCron = req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`
    let service
    let organizationId = null

    if (isCron) {
      service = getServiceClient()
    } else {
      const auth = await requireUser(req)
      service = auth.service
      organizationId = (req.body || {}).organizationId || null
      if (!organizationId) return res.status(400).json({ error: 'organizationId ontbreekt.' })
    }

    let query = service.from('hosting').select('*, clients!inner(organization_id)').eq('monitor_enabled', true).not('url', 'is', null)
    if (organizationId) query = query.eq('clients.organization_id', organizationId)
    const { data: sites, error } = await query
    if (error) throw error

    // Beperkte gelijktijdigheid i.p.v. alles tegelijk, anders kan een groot aantal
    // sites de functie-tijdslimiet of externe API-rate-limits raken.
    const results = []
    const batchSize = 3
    for (let i = 0; i < sites.length; i += batchSize) {
      const batch = sites.slice(i, i + batchSize)
      const batchResults = await Promise.all(batch.map(s => checkOneSite(service, s).catch(() => null)))
      results.push(...batchResults)
    }

    res.status(200).json({ checked: sites.length, results })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
