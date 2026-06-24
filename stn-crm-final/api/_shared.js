// Gedeelde helpers voor de admin-only serverless functions in deze map.
// Vercel routeert geen bestanden die met "_" beginnen, dus dit wordt geen eigen endpoint.
const { createClient } = require('@supabase/supabase-js')

function getServiceClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// Verifieert dat de aanroeper een geldige, ingelogde gebruiker is EN dat zijn
// e-mailadres exact overeenkomt met de server-only PLATFORM_ADMIN_EMAIL env var.
// Dit is de enige echte autorisatiecheck — alles client-side is uitsluitend UX.
async function requireAdmin(req) {
  const auth = req.headers.authorization || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) { const e = new Error('Geen sessie meegegeven.'); e.status = 401; throw e }

  const service = getServiceClient()
  const { data, error } = await service.auth.getUser(token)
  if (error || !data.user) { const e = new Error('Ongeldige sessie.'); e.status = 401; throw e }

  if (!process.env.PLATFORM_ADMIN_EMAIL || data.user.email !== process.env.PLATFORM_ADMIN_EMAIL) {
    const e = new Error('Geen toegang.'); e.status = 403; throw e
  }
  return { service, adminUser: data.user }
}

module.exports = { getServiceClient, requireAdmin }
