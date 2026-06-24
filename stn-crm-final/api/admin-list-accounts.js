const { requireAdmin } = require('./_shared')

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)

    const { data: orgs, error: orgErr } = await service.from('organizations').select('*').order('created_at', { ascending: true })
    if (orgErr) throw orgErr

    // Een account kan nu lid zijn van meerdere organisaties, dus dit komt via
    // memberships (organization_id + role), niet meer rechtstreeks van profiles.
    const { data: memberships, error: memErr } = await service.from('memberships').select('user_id, organization_id, role, profiles(*)')
    if (memErr) throw memErr

    // profiles heeft geen e-mailkolom — die staat alleen in auth.users, dus
    // hier ophalen met de service-role en mergen. (perPage 1000: prima voor nu,
    // bij veel grotere platforms moet dit gepagineerd worden.)
    const { data: userList, error: userErr } = await service.auth.admin.listUsers({ perPage: 1000 })
    if (userErr) throw userErr
    const emailById = Object.fromEntries(userList.users.map(u => [u.id, u.email]))

    const profiles = memberships.map(m => ({
      id: m.user_id,
      organization_id: m.organization_id,
      role: m.role,
      full_name: m.profiles?.full_name || null,
      email: emailById[m.user_id] || null
    }))

    res.status(200).json({ organizations: orgs, profiles })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
