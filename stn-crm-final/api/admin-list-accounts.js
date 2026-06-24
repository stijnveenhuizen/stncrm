const { requireAdmin } = require('./_shared')

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)

    const { data: orgs, error: orgErr } = await service.from('organizations').select('*').order('created_at', { ascending: true })
    if (orgErr) throw orgErr

    const { data: profiles, error: profErr } = await service.from('profiles').select('*').order('role', { ascending: true })
    if (profErr) throw profErr

    // profiles heeft geen e-mailkolom — die staat alleen in auth.users, dus
    // hier ophalen met de service-role en mergen. (perPage 1000: prima voor nu,
    // bij veel grotere platforms moet dit gepagineerd worden.)
    const { data: userList, error: userErr } = await service.auth.admin.listUsers({ perPage: 1000 })
    if (userErr) throw userErr
    const emailById = Object.fromEntries(userList.users.map(u => [u.id, u.email]))
    const enriched = profiles.map(p => ({ ...p, email: emailById[p.id] || null }))

    res.status(200).json({ organizations: orgs, profiles: enriched })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
