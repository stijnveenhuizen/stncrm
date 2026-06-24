const { requireAdmin } = require('./_shared')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service, adminUser } = await requireAdmin(req)
    const { email } = req.body || {}
    if (!email) return res.status(400).json({ error: 'E-mailadres ontbreekt.' })

    const { data, error: linkErr } = await service.auth.admin.generateLink({ type: 'magiclink', email })
    if (linkErr) throw linkErr

    // Loggen wie wie impersoneert — alleen via de service-role, dus niet
    // zichtbaar of aanpasbaar via de normale app (geen RLS-policies op deze tabel).
    await service.from('impersonation_log').insert([{
      admin_email: adminUser.email,
      target_user_id: data.user.id,
      target_email: email
    }])

    // Geef NOOIT de service-role key terug — alleen het eenmalige, korte-leeftijd token.
    res.status(200).json({ token_hash: data.properties.hashed_token })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
