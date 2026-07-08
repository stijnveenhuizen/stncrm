// Verzamel-endpoint voor alle admin-only SCHRIJF-acties (zelfde reden als api/admin.js:
// Vercel Hobby staat max 12 functions toe). action in de request-body bepaalt de operatie.
const { requireAdmin } = require('./_shared')

async function impersonate(service, adminUser, body) {
  const { email, reason, workspaceId } = body
  if (!email) { const e = new Error('E-mailadres ontbreekt.'); e.status = 400; throw e }
  if (!reason || !reason.trim()) { const e = new Error('Reden is verplicht.'); e.status = 400; throw e }

  const { data, error: linkErr } = await service.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkErr) throw linkErr

  const { data: logRow, error: logErr } = await service.from('impersonation_log').insert([{
    admin_email: adminUser.email, target_user_id: data.user.id, target_email: email,
    reason: reason.trim(), workspace_id: workspaceId || null,
  }]).select().single()
  if (logErr) throw logErr

  return { token_hash: data.properties.hashed_token, logId: logRow.id }
}

async function endImpersonation(service, adminUser, body) {
  const { logId } = body
  if (!logId) { const e = new Error('logId ontbreekt.'); e.status = 400; throw e }
  const { error } = await service.from('impersonation_log').update({ ended_at: new Date().toISOString() }).eq('id', logId)
  if (error) throw error
  return { ok: true }
}

async function resolveError(service, adminUser, body) {
  const { id } = body
  if (!id) { const e = new Error('id ontbreekt.'); e.status = 400; throw e }
  const { error } = await service.from('system_errors').update({ resolved_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  return { ok: true }
}

// Nieuwe-klant-uitnodigingen: hergebruikt Supabase's eigen invite-mechanisme
// (auth.admin.inviteUserByEmail) i.p.v. een eigen tokens-tabel + e-mailservice te
// bouwen — Supabase verstuurt de e-mail zelf (Auth → Email Templates in het
// dashboard om de tekst aan te passen) en de invite-status volgt uit auth.users
// zelf (invited_at/confirmed_at), dus geen aparte "invitations"-tabel nodig.
// user_metadata.invited_by_admin_email markeert dat dit specifiek een
// platform-invite is (i.p.v. een team- of klantportaal-uitnodiging, die al
// bestaande, andere mechanismes gebruiken).
async function sendInvite(service, adminUser, body) {
  const { email } = body
  if (!email || !email.trim()) { const e = new Error('E-mailadres ontbreekt.'); e.status = 400; throw e }
  const redirectTo = body.redirectTo || undefined
  const { error } = await service.auth.admin.inviteUserByEmail(email.trim(), {
    redirectTo,
    data: { invited_by_admin_email: adminUser.email },
  })
  if (error) throw error
  return { ok: true }
}

async function revokeInvite(service, adminUser, body) {
  const { userId } = body
  if (!userId) { const e = new Error('userId ontbreekt.'); e.status = 400; throw e }
  const { data: userData, error: getErr } = await service.auth.admin.getUserById(userId)
  if (getErr) throw getErr
  if (userData?.user?.email_confirmed_at) { const e = new Error('Deze uitnodiging is al gebruikt — het account kan hier niet meer worden ingetrokken.'); e.status = 400; throw e }
  const { error } = await service.auth.admin.deleteUser(userId)
  if (error) throw error
  return { ok: true }
}

const ACTIONS = {
  impersonate, 'end-impersonation': endImpersonation, 'resolve-error': resolveError,
  'send-invite': sendInvite, 'revoke-invite': revokeInvite,
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service, adminUser } = await requireAdmin(req)
    const body = req.body || {}
    const handler = ACTIONS[body.action]
    if (!handler) return res.status(400).json({ error: 'Onbekende action.' })
    const result = await handler(service, adminUser, body)
    res.status(200).json(result)
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
