const { requireAdmin } = require('./_shared')

const FREQ_MONTHS = { maandelijks: 1, kwartaallijks: 3, jaarlijks: 12 }

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)
    const { organizationId } = req.query || {}
    if (!organizationId) return res.status(400).json({ error: 'organizationId ontbreekt.' })

    const [{ data: org, error: orgErr }, { data: members, error: memErr }, { data: clients }, { data: projects }, { data: invoices }, { data: recurring }, { data: events }] = await Promise.all([
      service.from('organizations').select('*').eq('id', organizationId).single(),
      service.from('memberships').select('role, user_id, profiles(full_name)').eq('organization_id', organizationId),
      service.from('clients').select('id').eq('organization_id', organizationId),
      service.from('projects').select('id').eq('organization_id', organizationId),
      service.from('invoices').select('amount, status, clients!inner(organization_id)').eq('clients.organization_id', organizationId),
      service.from('recurring').select('amount, freq, status, clients!inner(organization_id)').eq('clients.organization_id', organizationId),
      service.from('admin_events').select('*').eq('workspace_id', organizationId).order('created_at', { ascending: false }).limit(20),
    ])
    if (orgErr) throw orgErr
    if (memErr) throw memErr

    const owner = (members || []).find(m => m.role === 'owner')
    const revenueTotal = (invoices || []).filter(i => i.status === 'betaald').reduce((s, i) => s + Number(i.amount), 0)
    const mrr = (recurring || []).filter(r => r.status === 'actief').reduce((s, r) => s + Number(r.amount) / (FREQ_MONTHS[r.freq] || 1), 0)

    let ownerEmail = null
    if (owner?.user_id) {
      const { data: ownerUser } = await service.auth.admin.getUserById(owner.user_id)
      ownerEmail = ownerUser?.user?.email || null
    }

    res.status(200).json({
      workspace: { ...org, owner_email: ownerEmail },
      owner: owner?.profiles?.full_name || null,
      ownerUserId: owner?.user_id || null,
      members: (members || []).map(m => ({ user_id: m.user_id, role: m.role, full_name: m.profiles?.full_name || '—' })),
      stats: {
        clientCount: (clients || []).length,
        projectCount: (projects || []).length,
        invoiceCount: (invoices || []).length,
        revenueTotal, mrr,
      },
      recentActivity: events || [],
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
