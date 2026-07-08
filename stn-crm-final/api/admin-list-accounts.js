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

    // Clients hebben ook een auth.users-rij (portaalaccount) — voor het onderscheid
    // EIGENAAR/TEAMLID/CLIENT in de gebruikerstabel.
    const { data: clientAuthRows } = await service.from('clients').select('auth_user_id').not('auth_user_id', 'is', null)
    const clientAuthIds = new Set((clientAuthRows || []).map(c => c.auth_user_id))

    const users = userList.users.map(u => {
      const memberships = membershipsByUser[u.id] || []
      const role = memberships.some(m => m.role === 'owner') ? 'owner' : memberships.length ? 'member' : clientAuthIds.has(u.id) ? 'client' : 'member'
      const lastActive = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null
      return {
        id: u.id,
        email: u.email,
        full_name: profileById[u.id]?.full_name || null,
        memberships,
        role,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        status: lastActive && (Date.now() - lastActive.getTime()) > 30 * 86400000 ? 'inactief' : 'actief',
      }
    })

    res.status(200).json({ users })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
