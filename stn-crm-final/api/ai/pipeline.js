const { requireUser } = require('../_shared')

// Groq biedt een écht gratis API-tier (geen betaalmethode nodig), in
// tegenstelling tot Gemini waar de gratis tier voor EU/EEA-accounts op 0 staat.
// OpenAI-compatibele chat-completions endpoint, dus geen extra SDK nodig.
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

const DAILY_LIMIT = 50
const SYSTEM_PROMPT = 'Je antwoordt altijd direct en zakelijk in het Nederlands, zonder inleidende zinnen zoals "Hier is..." of "Natuurlijk,". Geen markdown-opmaak, geen opsommingen, gewoon platte tekst.'

// Bepaalt rot-status (zelfde logica als db.rotLevel/daysInStage client-side) zodat
// de AI ook weet of een deal al een tijd stilligt, zonder dat de client dit los
// hoeft te berekenen en door te geven.
function rotStatus(prospect, stage, daysInStage) {
  if (!stage || stage.is_won || stage.is_lost || !stage.rot_days || daysInStage == null) return 'normaal, geen stilstand'
  if (daysInStage >= stage.rot_days * 2) return `ja, zwaar — ${daysInStage} dagen geen activiteit (drempel: ${stage.rot_days * 2}+)`
  if (daysInStage >= stage.rot_days) return `licht — ${daysInStage} dagen geen activiteit (drempel: ${stage.rot_days}+)`
  return 'normaal, geen stilstand'
}

function buildPrompt(type, payload) {
  const { prospect, stage, activities = [], hasQuote, daysInStage } = payload
  const activityTitles = activities.map(a => a.title).join(', ') || 'geen'
  const rotting = rotStatus(prospect, stage, daysInStage)

  if (type === 'summary') {
    return `Je bent een assistent voor een webdesignbureau. Analyseer deze prospect en schrijf een korte zakelijke samenvatting (max 3 zinnen).

Prospect data:
- Naam: ${prospect.fname} ${prospect.lname}
- Bedrijf: ${prospect.company || 'onbekend'}
- Sector/type: ${prospect.website_type || 'onbekend'}
- Waarde: €${prospect.deal_value || 0}
- Fase: ${stage?.name || 'onbekend'}
- Prioriteit: ${prospect.priority || 'normaal'}
- Bron: ${prospect.source || 'onbekend'}
- Dagen in huidige fase: ${daysInStage ?? 'onbekend'}
- Deal rotting: ${rotting}
- Activiteiten (nieuwste eerst): ${activityTitles}
- Offerte verstuurd: ${hasQuote ? 'ja' : 'nee'}
- Notities: ${prospect.notes || 'geen'}

Schrijf een beknopte samenvatting die uitlegt wie dit is, wat de kans lijkt en wat de context is. Benoem het als de deal stilligt.`
  }

  if (type === 'next_action') {
    return `Je bent een sales coach voor een webdesignbureau. Geef exact één concrete aanbeveling voor de volgende actie voor deze prospect. Maximaal 2 zinnen. Wees specifiek en praktisch (bijv. "bel binnen 2 dagen over X" i.p.v. "neem contact op").

Prospect:
- Fase: ${stage?.name || 'onbekend'} (win-kans: ${prospect.win_probability ?? stage?.win_probability ?? 0}%)
- Dagen in huidige fase: ${daysInStage ?? 'onbekend'}
- Deal rotting: ${rotting}
- Waarde: €${prospect.deal_value || 0}
- Type project: ${prospect.website_type || 'onbekend'}
- Prioriteit: ${prospect.priority || 'normaal'}
- Laatste activiteiten (nieuwste eerst): ${activityTitles}
- Offerte verstuurd: ${hasQuote ? 'ja' : 'nee'}
- Follow-up/sluitdatum: ${prospect.expected_close_date || 'niet ingesteld'}`
  }

  if (type === 'win_probability') {
    return `Je bent een data-analist voor een webdesignbureau. Geef een win-kans percentage (0-100) voor deze deal en een korte uitleg (max 1 zin) waarom, gebaseerd op de gegevens hieronder — wijk gerust af van de standaard fase-win-kans als de gegevens daar aanleiding toe geven (bijv. lager bij rotting, hoger bij een verstuurde offerte en recente activiteit).

Antwoord ALLEEN in dit exacte JSON-formaat, zonder markdown-codeblok en zonder extra tekst ervoor of erna: {"percentage": 75, "uitleg": "..."}

Gegevens:
- Fase: ${stage?.name || 'onbekend'} (standaard win-kans van deze fase: ${stage?.win_probability ?? 0}%)
- Dagen in huidige fase: ${daysInStage ?? 'onbekend'}
- Deal rotting: ${rotting}
- Waarde deal: €${prospect.deal_value || 0}
- Aantal gelogde activiteiten: ${activities.length}
- Recente activiteiten: ${activityTitles}
- Offerte verstuurd: ${hasQuote ? 'ja' : 'nee'}
- Bron: ${prospect.source || 'onbekend'}
- Type project: ${prospect.website_type || 'onbekend'}
- Prioriteit: ${prospect.priority || 'normaal'}`
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
    const text = await callGroq(prompt, { system: SYSTEM_PROMPT, temperature: type === 'win_probability' ? 0.2 : 0.5 })

    if (usage) await service.from('ai_usage').update({ count: usage.count + 1 }).eq('user_id', user.id).eq('date', today)
    else await service.from('ai_usage').insert([{ user_id: user.id, date: today, count: 1 }])

    if (type === 'win_probability') {
      let parsed
      try {
        // Llama-modellen voegen soms preambule-tekst toe ondanks instructies — pak
        // het eerste {...}-blok in de tekst i.p.v. te vertrouwen op exacte fences.
        const match = text.match(/\{[\s\S]*\}/)
        parsed = JSON.parse(match ? match[0] : text)
        if (typeof parsed.percentage !== 'number') parsed.percentage = parseInt(parsed.percentage, 10)
        if (Number.isNaN(parsed.percentage)) parsed.percentage = null
        else parsed.percentage = Math.max(0, Math.min(100, parsed.percentage))
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

