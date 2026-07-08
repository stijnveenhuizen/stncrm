const { requireAdmin, computeOnboardingFunnel } = require('./_shared')

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)
    const stats = await computeOnboardingFunnel(service)
    res.status(200).json(stats)
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
