const { requireAdmin, computeOnboardingFunnel } = require('./_shared')

const FREQ_MONTHS = { maandelijks: 1, kwartaallijks: 3, jaarlijks: 12 }

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)

    const [{ data: userList, error: userErr }, { data: orgs, error: orgErr }, { data: recurring, error: recErr }, { data: events, error: evErr }] = await Promise.all([
      service.auth.admin.listUsers({ perPage: 1000 }),
      service.from('organizations').select('id, created_at'),
      service.from('recurring').select('amount, freq, status'),
      service.from('admin_events').select('user_id, event_type, event_name, created_at').gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    ])
    if (userErr) throw userErr
    if (orgErr) throw orgErr
    if (recErr) throw recErr
    if (evErr) throw evErr

    const users = userList.users
    const now = Date.now()
    const day = 86400000

    const totalUsers = users.length
    const activeWorkspaces = orgs.length
    const mrr = recurring.filter(r => r.status === 'actief').reduce((s, r) => s + Number(r.amount) / (FREQ_MONTHS[r.freq] || 1), 0)

    const newUsers30d = users.filter(u => now - new Date(u.created_at).getTime() <= 30 * day).length
    const newUsersPrev30d = users.filter(u => {
      const age = now - new Date(u.created_at).getTime()
      return age > 30 * day && age <= 60 * day
    }).length
    const newUsersChangePct = newUsersPrev30d > 0 ? Math.round(((newUsers30d - newUsersPrev30d) / newUsersPrev30d) * 1000) / 10 : null

    // Gebruikersgroei laatste 12 maanden (cumulatief).
    const months = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' }) })
    }
    const sortedUserDates = users.map(u => new Date(u.created_at)).sort((a, b) => a - b)
    const userGrowth = months.map(m => {
      const [y, mo] = m.key.split('-').map(Number)
      const cutoff = new Date(y, mo, 1) // eerste dag van de volgende maand
      const count = sortedUserDates.filter(d => d < cutoff).length
      return { month: m.label, users: count }
    })

    // Dagelijks actieve gebruikers, laatste 30 dagen.
    const dauByDay = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * day)
      dauByDay[d.toISOString().slice(0, 10)] = new Set()
    }
    events.forEach(e => {
      const key = e.created_at.slice(0, 10)
      if (dauByDay[key] && e.user_id) dauByDay[key].add(e.user_id)
    })
    const dau = Object.entries(dauByDay).map(([date, set]) => ({ date: date.slice(5), users: set.size }))

    // Meest bezochte pagina's (uit page_view events).
    const pageCounts = {}
    events.filter(e => e.event_type === 'page_view').forEach(e => { pageCounts[e.event_name] = (pageCounts[e.event_name] || 0) + 1 })
    const featureUsage = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }))

    const onboarding = await computeOnboardingFunnel(service)

    res.status(200).json({
      totalUsers, activeWorkspaces, mrr, newUsers30d, newUsersChangePct,
      userGrowth, dau, featureUsage,
      onboardingMini: onboarding.steps,
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
