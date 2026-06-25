const { requireUser } = require('../_shared')

async function fetchScore(url, strategy) {
  const key = process.env.PAGESPEED_API_KEY ? `&key=${process.env.PAGESPEED_API_KEY}` : ''
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}${key}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 50000)
  try {
    const res = await fetch(endpoint, { signal: controller.signal })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`PageSpeed ${strategy} faalde (${res.status}): ${body.slice(0, 300)}`)
      return { score: null, error: `HTTP ${res.status}` }
    }
    const data = await res.json()
    const score = data?.lighthouseResult?.categories?.performance?.score
    return { score: typeof score === 'number' ? Math.round(score * 100) : null, error: null }
  } catch (e) {
    console.error(`PageSpeed ${strategy} exception: ${e.message}`)
    return { score: null, error: e.message }
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireUser(req)
    const { siteId } = req.body || {}
    if (!siteId) return res.status(400).json({ error: 'siteId ontbreekt.' })

    const { data: site, error: siteErr } = await service.from('hosting').select('*').eq('id', siteId).single()
    if (siteErr || !site) return res.status(404).json({ error: 'Site niet gevonden.' })
    const checkUrl = site.pagespeed_url || site.url
    if (!checkUrl) return res.status(400).json({ error: 'Deze site heeft geen URL ingesteld.' })

    // PageSpeed Insights zonder API-key heeft een zeer lage, gedeelde anonieme
    // quota — voor structureel gebruik raden we PAGESPEED_API_KEY aan (gratis,
    // via Google Cloud Console, geen creditcard nodig voor deze specifieke API).
    const [mobile, desktop] = await Promise.all([fetchScore(checkUrl, 'mobile'), fetchScore(checkUrl, 'desktop')])

    const { data: check, error } = await service.from('website_checks').insert([{
      site_id: siteId, is_online: true, pagespeed_mobile: mobile.score, pagespeed_desktop: desktop.score,
    }]).select().single()
    if (error) throw error

    if (mobile.score == null && desktop.score == null) {
      return res.status(200).json({ check, warning: `PageSpeed gaf geen resultaat (mobile: ${mobile.error || 'onbekend'}, desktop: ${desktop.error || 'onbekend'}).` })
    }
    res.status(200).json({ check })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
