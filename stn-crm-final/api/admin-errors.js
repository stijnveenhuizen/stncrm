const { requireAdmin } = require('./_shared')

module.exports = async (req, res) => {
  try {
    const { service } = await requireAdmin(req)

    if (req.method === 'GET') {
      const { data, error } = await service.from('system_errors').select('*').order('created_at', { ascending: false }).limit(500)
      if (error) throw error
      res.status(200).json({ errors: data })
      return
    }
    if (req.method === 'PATCH') {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id ontbreekt.' })
      const { error } = await service.from('system_errors').update({ resolved_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
      res.status(200).json({ ok: true })
      return
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
