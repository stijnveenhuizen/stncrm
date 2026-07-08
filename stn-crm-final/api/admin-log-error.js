const { getServiceClient } = require('./_shared')

// Bewust GEEN requireUser/requireAdmin-gate: dit vangt ook fouten op vóórdat een
// sessie geladen is (bv. tijdens het inloggen zelf). user_id is dus altijd optioneel
// en wordt, indien aanwezig, meegegeven door de client zelf (best-effort, niet
// geverifieerd) — voor de error-log is dat acceptabel, in tegenstelling tot de
// platform-admin routes waar het wél om autorisatie gaat.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { message, stack, route, userId, workspaceId } = req.body || {}
    if (!message) return res.status(400).json({ error: 'message ontbreekt.' })
    const service = getServiceClient()
    await service.from('system_errors').insert([{
      user_id: userId || null, workspace_id: workspaceId || null,
      error_message: String(message).slice(0, 2000), error_stack: stack ? String(stack).slice(0, 8000) : null,
      route: route || null,
    }])
    res.status(200).json({ ok: true })
  } catch (e) {
    // Loggen mag zelf nooit een harde fout naar de gebruiker gooien.
    res.status(200).json({ ok: false })
  }
}
