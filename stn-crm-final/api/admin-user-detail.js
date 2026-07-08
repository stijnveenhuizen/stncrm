const { requireAdmin } = require('./_shared')

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)
    const { userId } = req.query || {}
    if (!userId) return res.status(400).json({ error: 'userId ontbreekt.' })

    const { data: userData, error: userErr } = await service.auth.admin.getUserById(userId)
    if (userErr || !userData?.user) return res.status(404).json({ error: 'Gebruiker niet gevonden.' })
    const user = userData.user

    const { data: profile } = await service.from('profiles').select('*').eq('id', userId).maybeSingle()

    const [{ data: memberships }, { data: events }, { data: impLog }] = await Promise.all([
      service.from('memberships').select('role, organizations(id, name, created_at)').eq('user_id', userId),
      service.from('admin_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      service.from('impersonation_log').select('*').eq('target_user_id', userId).order('created_at', { ascending: false }),
    ])

    const orgIds = (memberships || []).map(m => m.organizations?.id).filter(Boolean)
    let clientCounts = {}, projectCounts = {}
    if (orgIds.length) {
      const { data: clients } = await service.from('clients').select('id, organization_id').in('organization_id', orgIds)
      const { data: projects } = await service.from('projects').select('id, organization_id').in('organization_id', orgIds)
      ;(clients || []).forEach(c => { clientCounts[c.organization_id] = (clientCounts[c.organization_id] || 0) + 1 })
      ;(projects || []).forEach(p => { projectCounts[p.organization_id] = (projectCounts[p.organization_id] || 0) + 1 })
    }

    const workspaces = (memberships || []).map(m => ({
      id: m.organizations?.id, name: m.organizations?.name, role: m.role, created_at: m.organizations?.created_at,
      clientCount: clientCounts[m.organizations?.id] || 0, projectCount: projectCounts[m.organizations?.id] || 0,
    }))

    // Alle-events (niet alleen laatste 50) voor totalen/meest-bezochte-pagina, apart
    // van de 50-events-tijdlijn die de UI toont.
    const { data: allEvents } = await service.from('admin_events').select('event_type, event_name').eq('user_id', userId)
    const totalLogins = (allEvents || []).filter(e => e.event_type === 'login').length
    const pageCounts = {}
    ;(allEvents || []).filter(e => e.event_type === 'page_view').forEach(e => { pageCounts[e.event_name] = (pageCounts[e.event_name] || 0) + 1 })
    const mostVisitedPage = Object.entries(pageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
    const featuresUsed = [...new Set((allEvents || []).filter(e => e.event_type === 'action').map(e => e.event_name))]

    res.status(200).json({
      profile: {
        id: user.id, email: user.email, full_name: profile?.full_name || null,
        created_at: user.created_at, last_sign_in_at: user.last_sign_in_at,
        totalLogins, mostVisitedPage, featuresUsed,
      },
      workspaces,
      activity: events || [],
      impersonationLog: impLog || [],
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
