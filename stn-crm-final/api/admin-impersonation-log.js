const { requireAdmin } = require('./_shared')

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)
    const { data, error } = await service.from('impersonation_log').select('*, organizations(name)').order('created_at', { ascending: false }).limit(200)
    if (error) throw error
    res.status(200).json({ log: data })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
