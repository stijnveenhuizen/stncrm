const { requireAdmin } = require('./_shared')

const STEPS = ['welcome', 'company_setup', 'first_client', 'first_project', 'demo_tour', 'completed']

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)

    const { data: events, error: evErr } = await service.from('onboarding_events').select('*').order('created_at', { ascending: true })
    if (evErr) throw evErr
    const { data: orgs, error: orgErr } = await service.from('organizations').select('id, onboarding_completed, onboarding_skipped, onboarding_step')
    if (orgErr) throw orgErr

    const perStep = {}
    STEPS.forEach(s => { perStep[s] = { viewed: new Set(), completed: new Set(), skipped: new Set(), durations: [] } })

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
    for (const step of STEPS) {
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

    res.status(200).json({
      steps: stepStats,
      totalStarted: startedUsers.size,
      totalCompleted,
      totalSkipped
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
