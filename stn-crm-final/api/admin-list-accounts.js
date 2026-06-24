const { requireAdmin } = require('./_shared')

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)

    // Alle accounts op het platform — niet alleen die al ergens lid van zijn, anders
    // verdwijnen net aangemaakte/nog niet gekoppelde accounts uit het overzicht.
    const { data: userList, error: userErr } = await service.auth.admin.listUsers({ perPage: 1000 })
    if (userErr) throw userErr

    const { data: profiles, error: profErr } = await service.from('profiles').select('*')
    if (profErr) throw profErr
    const profileById = Object.fromEntries(profiles.map(p => [p.id, p]))

    const { data: memberships, error: memErr } = await service
      .from('memberships').select('user_id, role, organizations(id, name)')
    if (memErr) throw memErr
    const membershipsByUser = {}
    for (const m of memberships) {
      ;(membershipsByUser[m.user_id] ||= []).push({
        organization_id: m.organizations?.id,
        organization_name: m.organizations?.name,
        role: m.role
      })
    }

    const users = userList.users.map(u => ({
      id: u.id,
      email: u.email,
      full_name: profileById[u.id]?.full_name || null,
      memberships: membershipsByUser[u.id] || []
    }))

    res.status(200).json({ users })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
