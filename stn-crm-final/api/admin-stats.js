const { requireAdmin } = require('./_shared')

const ADOPTION_EVENTS = [
  { key: 'prospect_created', label: 'Een prospect aangemaakt' },
  { key: 'invoice_sent', label: 'Een factuur verstuurd' },
  { key: 'pipeline', label: 'De pipeline gebruikt' },
  { key: 'client_portal_invited', label: 'Een klant uitgenodigd voor het portaal' },
]

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)
    const { from, to } = req.query || {}
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000)
    const toDate = to ? new Date(to) : new Date()

    const { data: events, error: evErr } = await service.from('admin_events').select('*')
      .gte('created_at', fromDate.toISOString()).lte('created_at', toDate.toISOString())
    if (evErr) throw evErr

    // Populairste pagina's.
    const pageCounts = {}
    events.filter(e => e.event_type === 'page_view').forEach(e => { pageCounts[e.event_name] = (pageCounts[e.event_name] || 0) + 1 })
    const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))

    // Populairste acties.
    const actionCounts = {}
    events.filter(e => e.event_type === 'action').forEach(e => { actionCounts[e.event_name] = (actionCounts[e.event_name] || 0) + 1 })
    const topActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))

    // Gemiddelde sessieduur per dag: sessie = alle events van één user binnen 30 min
    // van elkaar; duur = laatste - eerste event in die sessie. Best-effort schatting
    // (geen aparte sessie-tabel), niet 100% nauwkeurig maar wel bruikbaar als trend.
    const byUser = {}
    events.forEach(e => { (byUser[e.user_id] ||= []).push(e) })
    const sessionDurationsByDay = {}
    Object.values(byUser).forEach(userEvents => {
      const sorted = [...userEvents].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      let sessionStart = null, sessionEnd = null
      const flush = () => {
        if (sessionStart && sessionEnd && sessionEnd > sessionStart) {
          const day = sessionStart.toISOString().slice(0, 10)
          ;(sessionDurationsByDay[day] ||= []).push((sessionEnd - sessionStart) / 60000)
        }
      }
      sorted.forEach(e => {
        const t = new Date(e.created_at)
        if (sessionStart && t - sessionEnd > 30 * 60000) flush(), (sessionStart = null)
        if (!sessionStart) sessionStart = t
        sessionEnd = t
      })
      flush()
    })
    const avgSessionByDay = Object.entries(sessionDurationsByDay).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, durations]) => ({ date: date.slice(5), minutes: Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10 }))

    // Peak usage: dag-van-week x uur heatmap.
    const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0))
    events.forEach(e => {
      const d = new Date(e.created_at)
      heatmap[d.getDay()][d.getHours()]++
    })

    // Retentie: cohort per registratiemaand, % dat nog actief was na 1/7/30 dagen.
    const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 })
    const allEventsRes = await service.from('admin_events').select('user_id, created_at')
    const allEvents = allEventsRes.data || []
    const eventsByUser = {}
    allEvents.forEach(e => { (eventsByUser[e.user_id] ||= []).push(new Date(e.created_at)) })

    const cohorts = {}
    users.users.forEach(u => {
      const signup = new Date(u.created_at)
      const key = `${signup.getFullYear()}-${String(signup.getMonth() + 1).padStart(2, '0')}`
      cohorts[key] ||= { month: key, total: 0, d1: 0, d7: 0, d30: 0 }
      cohorts[key].total++
      const userEvents = eventsByUser[u.id] || []
      const returnedAfter = days => userEvents.some(t => (t - signup) >= days * 86400000)
      if (returnedAfter(1)) cohorts[key].d1++
      if (returnedAfter(7)) cohorts[key].d7++
      if (returnedAfter(30)) cohorts[key].d30++
    })
    const retention = Object.values(cohorts).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12).map(c => ({
      month: c.month, total: c.total,
      d1Pct: c.total ? Math.round((c.d1 / c.total) * 100) : 0,
      d7Pct: c.total ? Math.round((c.d7 / c.total) * 100) : 0,
      d30Pct: c.total ? Math.round((c.d30 / c.total) * 100) : 0,
    }))

    // Feature-adoptie: % van alle gebruikers dat dit event ooit triggerde (over de
    // volledige geschiedenis, niet beperkt tot de gekozen periode hierboven).
    const totalUsers = users.users.length
    const everByEvent = {}
    const { data: adoptionEvents } = await service.from('admin_events').select('user_id, event_name')
    ;(adoptionEvents || []).forEach(e => { (everByEvent[e.event_name] ||= new Set()).add(e.user_id) })
    const featureAdoption = ADOPTION_EVENTS.map(a => ({
      label: a.label,
      pct: totalUsers ? Math.round(((everByEvent[a.key]?.size || 0) / totalUsers) * 100) : 0,
    }))

    res.status(200).json({ topPages, topActions, avgSessionByDay, heatmap, retention, featureAdoption })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
