const { requireAdmin } = require('./_shared')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)
    const { logId } = req.body || {}
    if (!logId) return res.status(400).json({ error: 'logId ontbreekt.' })
    const { error } = await service.from('impersonation_log').update({ ended_at: new Date().toISOString() }).eq('id', logId)
    if (error) throw error
    res.status(200).json({ ok: true })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
