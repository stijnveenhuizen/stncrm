// Gedeelde helpers voor de admin-only serverless functions in deze map.
// Vercel routeert geen bestanden die met "_" beginnen, dus dit wordt geen eigen endpoint.
const { createClient } = require('@supabase/supabase-js')

function getServiceClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Verifieert dat de aanroeper een geldige, ingelogde gebruiker is EN dat zijn
// e-mailadres exact overeenkomt met de server-only PLATFORM_ADMIN_EMAIL env var.
// Dit is de enige echte autorisatiecheck — alles client-side is uitsluitend UX.
async function requireAdmin(req) {
  const auth = req.headers.authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) { const e = new Error('Geen sessie meegegeven.'); e.status = 401; throw e }

  const service = getServiceClient()
  const { data, error } = await service.auth.getUser(token)
  if (error || !data.user) { const e = new Error('Ongeldige sessie.'); e.status = 401; throw e }

  if (!process.env.PLATFORM_ADMIN_EMAIL || data.user.email !== process.env.PLATFORM_ADMIN_EMAIL) {
    const e = new Error('Geen toegang.'); e.status = 403; throw e
  }
  return { service, adminUser: data.user }
}

// Verifieert alleen dat de aanroeper een geldige, ingelogde gebruiker is —
// voor endpoints die niet platform-admin-only zijn (bijv. de AI-route, die elke
// ingelogde staff/teamlid mag gebruiken op zijn eigen werkruimte-data).
async function requireUser(req) {
  const auth = req.headers.authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) { const e = new Error('Geen sessie meegegeven.'); e.status = 401; throw e }

  const service = getServiceClient()
  const { data, error } = await service.auth.getUser(token)
  if (error || !data.user) { const e = new Error('Ongeldige sessie.'); e.status = 401; throw e }
  return { service, user: data.user }
}

const ONBOARDING_STEPS = ['welcome', 'company_setup', 'first_client', 'first_project', 'demo_tour', 'completed']

// Gedeeld door admin-onboarding-stats.js en admin-overview.js (die laatste toont
// alleen een verkorte versie), zodat de funnel-berekening op precies één plek staat.
async function computeOnboardingFunnel(service) {
  const { data: events, error: evErr } = await service.from('onboarding_events').select('*').order('created_at', { ascending: true })
  if (evErr) throw evErr
  const { data: orgs, error: orgErr } = await service.from('organizations').select('id, onboarding_completed, onboarding_skipped, onboarding_step')
  if (orgErr) throw orgErr

  const perStep = {}
  ONBOARDING_STEPS.forEach(s => { perStep[s] = { viewed: new Set(), completed: new Set(), skipped: new Set(), durations: [] } })

  const viewedAtByUserStep = {}
  for (const e of events) {
    const bucket = perStep[e.step]
    if (!bucket) continue
    const key = e.user_id + ':' + e.step
    if (e.action === 'viewed') { bucket.viewed.add(e.user_id); viewedAtByUserStep[key] = new Date(e.created_at) }
    if (e.action === 'completed') {
      bucket.completed.add(e.user_id)
      const viewedAt = viewedAtByUserStep[key]
      if (viewedAt) bucket.durations.push((new Date(e.created_at) - viewedAt) / 1000)
    }
    if (e.action === 'skipped') bucket.skipped.add(e.user_id)
  }

  const stepStats = []
  let prevViewedCount = null
  for (const step of ONBOARDING_STEPS) {
    const b = perStep[step]
    const viewedCount = b.viewed.size
    const completedCount = b.completed.size
    const skippedCount = b.skipped.size
    const avgDuration = b.durations.length ? b.durations.reduce((s, d) => s + d, 0) / b.durations.length : null
    const dropoff = prevViewedCount && prevViewedCount > 0 ? Math.round((1 - viewedCount / prevViewedCount) * 1000) / 10 : 0
    stepStats.push({ step, viewed: viewedCount, completed: completedCount, skipped: skippedCount, avgDurationSeconds: avgDuration, dropoffPct: dropoff })
    prevViewedCount = viewedCount
  }

  const startedUsers = new Set(events.filter(e => e.step === 'welcome' && e.action === 'viewed').map(e => e.user_id))
  const totalCompleted = orgs.filter(o => o.onboarding_completed).length
  const totalSkipped = orgs.filter(o => o.onboarding_skipped).length

  // Voltooiingen per dag (laatste 30 dagen) voor de trendgrafiek op /admin/onboarding.
  const completionsByDay = {}
  events.filter(e => e.step === 'completed' && e.action === 'completed').forEach(e => {
    const day = e.created_at.slice(0, 10)
    completionsByDay[day] = (completionsByDay[day] || 0) + 1
  })

  return {
    steps: stepStats,
    totalStarted: startedUsers.size,
    totalCompleted,
    totalSkipped,
    completionsByDay,
  }
}

module.exports = { getServiceClient, requireAdmin, requireUser, computeOnboardingFunnel, ONBOARDING_STEPS }
