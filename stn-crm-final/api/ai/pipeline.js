const { requireUser } = require('../_shared')

// Groq biedt een écht gratis API-tier (geen betaalmethode nodig), in
// tegenstelling tot Gemini waar de gratis tier voor EU/EEA-accounts op 0 staat.
// OpenAI-compatibele chat-completions endpoint, dus geen extra SDK nodig.
async function callGroq(prompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    const e = new Error(`Groq-fout (${res.status}): ${body.slice(0, 300)}`); e.status = 502; throw e
  }
  const data = await res.json()
  return (data.choices?.[0]?.message?.content || '').trim()
}

const DAILY_LIMIT = 10

function buildPrompt(type, payload) {
  const { prospect, stage, activities = [], hasQuote, daysInStage } = payload
  const activityTitles = activities.map(a => a.title).join(', ') || 'geen'

  if (type === 'summary') {
    return `Je bent een assistent voor een webdesignbureau. Analyseer deze prospect en schrijf een korte zakelijke samenvatting in het Nederlands (max 3 zinnen).

Prospect data:
- Naam: ${prospect.fname} ${prospect.lname}
- Bedrijf: ${prospect.company || 'onbekend'}
- Sector/type: ${prospect.website_type || 'onbekend'}
- Waarde: €${prospect.deal_value || 0}
- Fase: ${stage?.name || 'onbekend'}
- Bron: ${prospect.source || 'onbekend'}
- Dagen in huidige fase: ${daysInStage ?? 'onbekend'}
- Activiteiten: ${activityTitles}
- Notities: ${prospect.notes || 'geen'}

Schrijf een beknopte samenvatting die uitlegt wie dit is, wat de kans lijkt en wat de context is.`
  }

  if (type === 'next_action') {
    return `Je bent een sales coach voor een webdesignbureau. Geef exact één concrete aanbeveling voor de volgende actie voor deze prospect. Maximaal 2 zinnen. Wees specifiek en praktisch. Reageer alleen in het Nederlands.

Prospect:
- Fase: ${stage?.name || 'onbekend'} (win-kans: ${prospect.win_probability ?? stage?.win_probability ?? 0}%)
- Laatste activiteit: ${prospect.last_activity_at || 'onbekend'} (${daysInStage ?? 'onbekend'} dagen geleden)
- Waarde: €${prospect.deal_value || 0}
- Type project: ${prospect.website_type || 'onbekend'}
- Laatste activiteiten: ${activityTitles}
- Offerte verstuurd: ${hasQuote ? 'ja' : 'nee'}
- Follow-up datum: ${prospect.expected_close_date || 'niet ingesteld'}`
  }

  if (type === 'win_probability') {
    return `Je bent een data-analist voor een webdesignbureau. Geef een win-kans percentage (0-100) voor deze deal en een korte uitleg (1 zin). Antwoord ALLEEN in dit JSON formaat, zonder markdown-codeblok: {"percentage": 75, "uitleg": "..."}

Gegevens:
- Fase: ${stage?.name || 'onbekend'} (standaard win-kans fase: ${stage?.win_probability ?? 0}%)
- Dagen in fase: ${daysInStage ?? 'onbekend'}
- Waarde deal: €${prospect.deal_value || 0}
- Aantal activiteiten: ${activities.length}
- Offerte verstuurd: ${hasQuote ? 'ja' : 'nee'}
- Bron: ${prospect.source || 'onbekend'}
- Type project: ${prospect.website_type || 'onbekend'}`
  }

  const e = new Error('Onbekend AI-type.'); e.status = 400; throw e
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service, user } = await requireUser(req)
    const { type, ...payload } = req.body || {}
    if (!['summary', 'next_action', 'win_probability'].includes(type)) {
      return res.status(400).json({ error: 'Ongeldig AI-type.' })
    }

    // ── Rate limiting: max 10 AI-calls per gebruiker per dag ──────────────────
    const today = new Date().toISOString().slice(0, 10)
    const { data: usage } = await service.from('ai_usage').select('*').eq('user_id', user.id).eq('date', today).maybeSingle()
    if (usage && usage.count >= DAILY_LIMIT) {
      return res.status(429).json({ error: `Je hebt vandaag het maximum aantal AI-analyses bereikt (${DAILY_LIMIT}/${DAILY_LIMIT}). Morgen kun je weer verder.` })
    }

    if (!process.env.GROQ_API_KEY) {
      const e = new Error('AI is niet geconfigureerd op de server (GROQ_API_KEY ontbreekt).'); e.status = 500; throw e
    }
    const prompt = buildPrompt(type, payload)
    const text = await callGroq(prompt)

    if (usage) await service.from('ai_usage').update({ count: usage.count + 1 }).eq('user_id', user.id).eq('date', today)
    else await service.from('ai_usage').insert([{ user_id: user.id, date: today, count: 1 }])

    if (type === 'win_probability') {
      let parsed
      try {
        const cleaned = text.replace(/^```json\s*|```$/g, '').trim()
        parsed = JSON.parse(cleaned)
      } catch (e) {
        parsed = { percentage: null, uitleg: text }
      }
      return res.status(200).json(parsed)
    }
    res.status(200).json({ result: text })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
