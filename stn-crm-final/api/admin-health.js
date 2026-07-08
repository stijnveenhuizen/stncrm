const { requireAdmin } = require('./_shared')

// Zelfde patroon als api/monitor/_lib.js: handmatige AbortController i.p.v.
// AbortSignal.timeout(), voor het geval de Vercel Node-runtime dat niet ondersteunt.
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function timed(fn) {
  const start = Date.now()
  try {
    await fn()
    return { status: 'online', ms: Date.now() - start }
  } catch (e) {
    return { status: 'error', ms: Date.now() - start, error: e.message }
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)

    const [database, auth, pagespeed, groq, cron] = await Promise.all([
      timed(async () => {
        const { error } = await service.from('organizations').select('id').limit(1)
        if (error) throw error
      }),
      timed(async () => {
        const { error } = await service.auth.admin.listUsers({ perPage: 1 })
        if (error) throw error
      }),
      timed(async () => {
        const r = await fetchWithTimeout('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com', {}, 8000)
        // Elke HTTP-respons (ook 4xx door de dummy-url) betekent dat de API zelf bereikbaar is.
        if (!r) throw new Error('Geen respons')
      }),
      timed(async () => {
        if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY niet ingesteld')
        const r = await fetchWithTimeout('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } }, 8000)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
      }),
      timed(async () => {
        const { data, error } = await service.from('website_checks').select('checked_at').order('checked_at', { ascending: false }).limit(1)
        if (error) throw error
        if (!data?.length) throw new Error('Nog geen checks uitgevoerd')
        const hoursAgo = (Date.now() - new Date(data[0].checked_at).getTime()) / 3600000
        if (hoursAgo > 30) throw new Error(`Laatste run ${Math.round(hoursAgo)}u geleden — cron lijkt niet te draaien`)
      }),
    ])

    res.status(200).json({
      checks: [
        { name: 'Database connectie', ...database },
        { name: 'Supabase Auth', ...auth },
        { name: 'PageSpeed API', ...pagespeed },
        { name: 'Groq AI API', ...groq },
        { name: 'Vercel Cron (website monitor)', ...cron },
        { name: 'E-mailservice', status: 'not_configured', ms: null },
      ],
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
