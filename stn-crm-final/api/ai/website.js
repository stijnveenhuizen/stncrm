const { requireUser } = require('../_shared')

// Zelfde Groq-aanpak als api/ai/pipeline.js (echt gratis tier, geen
// betaalmethode nodig, OpenAI-compatibele chat-completions endpoint).
async function callGroq(prompt, { system, temperature = 0.4 } = {}) {
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: prompt })
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature }),
  })
  if (!res.ok) {
    const body = await res.text()
    const e = new Error(`Groq-fout (${res.status}): ${body.slice(0, 300)}`); e.status = 502; throw e
  }
  const data = await res.json()
  return (data.choices?.[0]?.message?.content || '').trim()
}

const DAILY_LIMIT = 10
const SYSTEM_PROMPT = 'Je antwoordt altijd direct en zakelijk in het Nederlands, zonder inleidende zinnen zoals "Hier is..." of "Natuurlijk,". Geen markdown-opmaak. Geef een genummerde lijst van maximaal 5 concrete, uitvoerbare verbeterpunten, elk in 1-2 zinnen.'

function formatAudits(audits = []) {
  if (!audits.length) return 'geen specifieke knelpunten gevonden'
  return audits.map(a => `${a.title}${a.displayValue ? ` (${a.displayValue})` : ''}${a.savingsMs ? ` — bespaart ~${a.savingsMs}ms` : ''}`).join('; ')
}

function buildPrompt({ site, check }) {
  const audits = check?.pagespeed_audits || {}
  return `Je bent een technisch performance-consultant voor een webdesignbureau. Analyseer deze PageSpeed-data van een klantsite en geef concrete verbeterpunten om de site sneller te maken.

Site: ${site.site_name || site.domain || site.url}
PageSpeed mobile score: ${check?.pagespeed_mobile ?? 'onbekend'}/100
PageSpeed desktop score: ${check?.pagespeed_desktop ?? 'onbekend'}/100
SSL geldig: ${check?.ssl_valid === false ? 'nee — probleem!' : check?.ssl_valid ? 'ja' : 'onbekend'}
Online: ${check?.is_online === false ? 'nee — site is offline!' : 'ja'}
WordPress versie: ${check?.wp_version || 'onbekend / geen WordPress'}

Belangrijkste knelpunten (mobile): ${formatAudits(audits.mobile)}
Belangrijkste knelpunten (desktop): ${formatAudits(audits.desktop)}

Geef een genummerde lijst met maximaal 5 concrete, technische verbeterpunten, gesorteerd op impact. Wees specifiek (bijv. "comprimeer afbeeldingen naar WebP, kan tot Xms besparen" i.p.v. "verbeter afbeeldingen"). Als de scores al goed zijn (90+), zeg dat kort en benoem eventueel kleine optimalisaties.`
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service, user } = await requireUser(req)
    const { siteId } = req.body || {}
    if (!siteId) return res.status(400).json({ error: 'siteId ontbreekt.' })

    const { data: site, error: siteErr } = await service.from('hosting').select('*').eq('id', siteId).single()
    if (siteErr || !site) return res.status(404).json({ error: 'Site niet gevonden.' })

    const { data: checks } = await service.from('website_checks').select('*').eq('site_id', siteId).order('checked_at', { ascending: false }).limit(1)
    const check = checks?.[0]
    if (!check || (check.pagespeed_mobile == null && check.pagespeed_desktop == null)) {
      return res.status(400).json({ error: 'Voer eerst een PageSpeed-check uit voor deze site (knop "Nu checken").' })
    }

    const today = new Date().toISOString().slice(0, 10)
    const { data: usage } = await service.from('ai_usage').select('*').eq('user_id', user.id).eq('date', today).maybeSingle()
    if (usage && usage.count >= DAILY_LIMIT) {
      return res.status(429).json({ error: `Je hebt vandaag het maximum aantal AI-analyses bereikt (${DAILY_LIMIT}/${DAILY_LIMIT}). Morgen kun je weer verder.` })
    }
    if (!process.env.GROQ_API_KEY) {
      const e = new Error('AI is niet geconfigureerd op de server (GROQ_API_KEY ontbreekt).'); e.status = 500; throw e
    }

    const prompt = buildPrompt({ site, check })
    const result = await callGroq(prompt, { system: SYSTEM_PROMPT, temperature: 0.4 })

    if (usage) await service.from('ai_usage').update({ count: usage.count + 1 }).eq('user_id', user.id).eq('date', today)
    else await service.from('ai_usage').insert([{ user_id: user.id, date: today, count: 1 }])

    await service.from('hosting').update({ ai_advice: result, ai_advice_generated_at: new Date().toISOString() }).eq('id', siteId)

    res.status(200).json({ result })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
