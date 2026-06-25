const { requireUser } = require('../_shared')

// Pikt de bruikbare "opportunities" (concrete besparingen) en falende
// diagnostics uit het Lighthouse-rapport, zodat we straks AI-advies kunnen
// geven op basis van échte signalen i.p.v. alleen het kale eindcijfer.
function extractAudits(lighthouseResult) {
  if (!lighthouseResult?.audits) return []
  const refs = lighthouseResult.categories?.performance?.auditRefs || []
  const relevant = refs.filter(r => (r.group === 'load-opportunities' || r.group === 'diagnostics') && r.weight > 0)
  const audits = []
  for (const ref of relevant) {
    const audit = lighthouseResult.audits[ref.id]
    if (!audit || audit.score === 1 || audit.score === null) continue
    audits.push({
      id: ref.id,
      title: audit.title,
      displayValue: audit.displayValue || null,
      savingsMs: audit.details?.overallSavingsMs ? Math.round(audit.details.overallSavingsMs) : null,
    })
  }
  return audits.sort((a, b) => (b.savingsMs || 0) - (a.savingsMs || 0)).slice(0, 8)
}

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
      return { score: null, audits: [], error: `HTTP ${res.status}` }
    }
    const data = await res.json()
    const score = data?.lighthouseResult?.categories?.performance?.score
    return { score: typeof score === 'number' ? Math.round(score * 100) : null, audits: extractAudits(data?.lighthouseResult), error: null }
  } catch (e) {
    console.error(`PageSpeed ${strategy} exception: ${e.message}`)
    return { score: null, audits: [], error: e.message }
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
      pagespeed_audits: { mobile: mobile.audits, desktop: desktop.audits },
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
