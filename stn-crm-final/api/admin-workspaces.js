const { requireAdmin } = require('./_shared')

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)

    const [{ data: orgs, error: orgErr }, { data: memberships, error: memErr }, { data: clients, error: clErr }, { data: projects, error: prErr }] = await Promise.all([
      service.from('organizations').select('id, name, created_at'),
      service.from('memberships').select('organization_id, role, user_id, profiles(full_name)'),
      service.from('clients').select('id, organization_id'),
      service.from('projects').select('id, organization_id'),
    ])
    if (orgErr) throw orgErr
    if (memErr) throw memErr
    if (clErr) throw clErr
    if (prErr) throw prErr

    const clientCountByOrg = {}, projectCountByOrg = {}
    clients.forEach(c => { clientCountByOrg[c.organization_id] = (clientCountByOrg[c.organization_id] || 0) + 1 })
    projects.forEach(p => { projectCountByOrg[p.organization_id] = (projectCountByOrg[p.organization_id] || 0) + 1 })

    const membersByOrg = {}
    memberships.forEach(m => { (membersByOrg[m.organization_id] ||= []).push(m) })

    const workspaces = orgs.map(o => {
      const members = membersByOrg[o.id] || []
      const owner = members.find(m => m.role === 'owner')
      return {
        id: o.id, name: o.name, created_at: o.created_at,
        owner: owner?.profiles?.full_name || '—',
        userCount: members.length,
        clientCount: clientCountByOrg[o.id] || 0,
        projectCount: projectCountByOrg[o.id] || 0,
      }
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    res.status(200).json({ workspaces })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
