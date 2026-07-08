// Eén verzamel-endpoint voor alle READ-only admin-queries, elk als eigen
// "resource" via ?resource=... — nodig omdat Vercel Hobby maximaal 12 serverless
// functions per deployment toestaat en dit anders 9 losse bestanden waren.
// Elke resource deed voorheen precies dit, ongewijzigd overgenomen.
const { requireAdmin, computeOnboardingFunnel } = require('./_shared')

const FREQ_MONTHS = { maandelijks: 1, kwartaallijks: 3, jaarlijks: 12 }
const ADOPTION_EVENTS = [
  { key: 'prospect_created', label: 'Een prospect aangemaakt' },
  { key: 'invoice_sent', label: 'Een factuur verstuurd' },
  { key: 'pipeline', label: 'De pipeline gebruikt' },
  { key: 'client_portal_invited', label: 'Een klant uitgenodigd voor het portaal' },
]

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}
async function timed(fn) {
  const start = Date.now()
  try {
    await fn()
    return { status: 'online', ms: Date.now() - start }
  } catch (e) {
    return { status: 'error', ms: Date.now() - start, error: e.message }
  }
}

async function overview(service) {
  const [{ data: userList, error: userErr }, { data: orgs, error: orgErr }, { data: recurring, error: recErr }, { data: events, error: evErr }] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 1000 }),
    service.from('organizations').select('id, created_at'),
    service.from('recurring').select('amount, freq, status'),
    service.from('admin_events').select('user_id, event_type, event_name, created_at').gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
  ])
  if (userErr) throw userErr
  if (orgErr) throw orgErr
  if (recErr) throw recErr
  if (evErr) throw evErr

  const users = userList.users
  const now = Date.now()
  const day = 86400000

  const totalUsers = users.length
  const activeWorkspaces = orgs.length
  const mrr = recurring.filter(r => r.status === 'actief').reduce((s, r) => s + Number(r.amount) / (FREQ_MONTHS[r.freq] || 1), 0)

  const newUsers30d = users.filter(u => now - new Date(u.created_at).getTime() <= 30 * day).length
  const newUsersPrev30d = users.filter(u => {
    const age = now - new Date(u.created_at).getTime()
    return age > 30 * day && age <= 60 * day
  }).length
  const newUsersChangePct = newUsersPrev30d > 0 ? Math.round(((newUsers30d - newUsersPrev30d) / newUsersPrev30d) * 1000) / 10 : null

  const months = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' }) })
  }
  const sortedUserDates = users.map(u => new Date(u.created_at)).sort((a, b) => a - b)
  const userGrowth = months.map(m => {
    const [y, mo] = m.key.split('-').map(Number)
    const cutoff = new Date(y, mo, 1)
    const count = sortedUserDates.filter(d => d < cutoff).length
    return { month: m.label, users: count }
  })

  const dauByDay = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * day)
    dauByDay[d.toISOString().slice(0, 10)] = new Set()
  }
  events.forEach(e => {
    const key = e.created_at.slice(0, 10)
    if (dauByDay[key] && e.user_id) dauByDay[key].add(e.user_id)
  })
  const dau = Object.entries(dauByDay).map(([date, set]) => ({ date: date.slice(5), users: set.size }))

  const pageCounts = {}
  events.filter(e => e.event_type === 'page_view').forEach(e => { pageCounts[e.event_name] = (pageCounts[e.event_name] || 0) + 1 })
  const featureUsage = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }))

  const onboarding = await computeOnboardingFunnel(service)

  return { totalUsers, activeWorkspaces, mrr, newUsers30d, newUsersChangePct, userGrowth, dau, featureUsage, onboardingMini: onboarding.steps }
}

async function listAccounts(service) {
  const { data: userList, error: userErr } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (userErr) throw userErr

  const { data: profiles, error: profErr } = await service.from('profiles').select('*')
  if (profErr) throw profErr
  const profileById = Object.fromEntries(profiles.map(p => [p.id, p]))

  const { data: memberships, error: memErr } = await service.from('memberships').select('user_id, role, organizations(id, name)')
  if (memErr) throw memErr
  const membershipsByUser = {}
  for (const m of memberships) {
    ;(membershipsByUser[m.user_id] ||= []).push({ organization_id: m.organizations?.id, organization_name: m.organizations?.name, role: m.role })
  }

  const { data: clientAuthRows } = await service.from('clients').select('auth_user_id').not('auth_user_id', 'is', null)
  const clientAuthIds = new Set((clientAuthRows || []).map(c => c.auth_user_id))

  const users = userList.users.map(u => {
    const memberships = membershipsByUser[u.id] || []
    const role = memberships.some(m => m.role === 'owner') ? 'owner' : memberships.length ? 'member' : clientAuthIds.has(u.id) ? 'client' : 'member'
    const lastActive = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null
    return {
      id: u.id, email: u.email, full_name: profileById[u.id]?.full_name || null, memberships, role,
      created_at: u.created_at, last_sign_in_at: u.last_sign_in_at || null,
      status: lastActive && (Date.now() - lastActive.getTime()) > 30 * 86400000 ? 'inactief' : 'actief',
    }
  })
  return { users }
}

async function userDetail(service, userId) {
  if (!userId) { const e = new Error('userId ontbreekt.'); e.status = 400; throw e }
  const { data: userData, error: userErr } = await service.auth.admin.getUserById(userId)
  if (userErr || !userData?.user) { const e = new Error('Gebruiker niet gevonden.'); e.status = 404; throw e }
  const user = userData.user

  const { data: profile } = await service.from('profiles').select('*').eq('id', userId).maybeSingle()

  const [{ data: memberships }, { data: events }, { data: impLog }] = await Promise.all([
    service.from('memberships').select('role, organizations(id, name, created_at)').eq('user_id', userId),
    service.from('admin_events').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    service.from('impersonation_log').select('*').eq('target_user_id', userId).order('created_at', { ascending: false }),
  ])

  const orgIds = (memberships || []).map(m => m.organizations?.id).filter(Boolean)
  let clientCounts = {}, projectCounts = {}
  if (orgIds.length) {
    const { data: clients } = await service.from('clients').select('id, organization_id').in('organization_id', orgIds)
    const { data: projects } = await service.from('projects').select('id, organization_id').in('organization_id', orgIds)
    ;(clients || []).forEach(c => { clientCounts[c.organization_id] = (clientCounts[c.organization_id] || 0) + 1 })
    ;(projects || []).forEach(p => { projectCounts[p.organization_id] = (projectCounts[p.organization_id] || 0) + 1 })
  }

  const workspaces = (memberships || []).map(m => ({
    id: m.organizations?.id, name: m.organizations?.name, role: m.role, created_at: m.organizations?.created_at,
    clientCount: clientCounts[m.organizations?.id] || 0, projectCount: projectCounts[m.organizations?.id] || 0,
  }))

  const { data: allEvents } = await service.from('admin_events').select('event_type, event_name').eq('user_id', userId)
  const totalLogins = (allEvents || []).filter(e => e.event_type === 'login').length
  const pageCounts = {}
  ;(allEvents || []).filter(e => e.event_type === 'page_view').forEach(e => { pageCounts[e.event_name] = (pageCounts[e.event_name] || 0) + 1 })
  const mostVisitedPage = Object.entries(pageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  const featuresUsed = [...new Set((allEvents || []).filter(e => e.event_type === 'action').map(e => e.event_name))]

  return {
    profile: { id: user.id, email: user.email, full_name: profile?.full_name || null, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at, totalLogins, mostVisitedPage, featuresUsed },
    workspaces, activity: events || [], impersonationLog: impLog || [],
  }
}

async function workspaces(service) {
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

  const list = orgs.map(o => {
    const members = membersByOrg[o.id] || []
    const owner = members.find(m => m.role === 'owner')
    return {
      id: o.id, name: o.name, created_at: o.created_at, owner: owner?.profiles?.full_name || '—',
      userCount: members.length, clientCount: clientCountByOrg[o.id] || 0, projectCount: projectCountByOrg[o.id] || 0,
    }
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return { workspaces: list }
}

async function workspaceDetail(service, organizationId) {
  if (!organizationId) { const e = new Error('organizationId ontbreekt.'); e.status = 400; throw e }
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

  return {
    workspace: { ...org, owner_email: ownerEmail },
    owner: owner?.profiles?.full_name || null,
    ownerUserId: owner?.user_id || null,
    members: (members || []).map(m => ({ user_id: m.user_id, role: m.role, full_name: m.profiles?.full_name || '—' })),
    stats: { clientCount: (clients || []).length, projectCount: (projects || []).length, invoiceCount: (invoices || []).length, revenueTotal, mrr },
    recentActivity: events || [],
  }
}

async function stats(service, from, to) {
  const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 86400000)
  const toDate = to ? new Date(to) : new Date()

  const { data: events, error: evErr } = await service.from('admin_events').select('*')
    .gte('created_at', fromDate.toISOString()).lte('created_at', toDate.toISOString())
  if (evErr) throw evErr

  const pageCounts = {}
  events.filter(e => e.event_type === 'page_view').forEach(e => { pageCounts[e.event_name] = (pageCounts[e.event_name] || 0) + 1 })
  const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))

  const actionCounts = {}
  events.filter(e => e.event_type === 'action').forEach(e => { actionCounts[e.event_name] = (actionCounts[e.event_name] || 0) + 1 })
  const topActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))

  const byUser = {}
  events.forEach(e => { (byUser[e.user_id] ||= []).push(e) })
  const sessionDurationsByDay = {}
  Object.values(byUser).forEach(userEvents => {
    const sorted = [...userEvents].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    let sessionStart = null, sessionEnd = null
    const flush = () => {
      if (sessionStart && sessionEnd && sessionEnd > sessionStart) {
        const day = sessionStart.toISOString().slice(0, 10)
        ;(sessionDurationsByDay[day] ||= []).push((sessionEnd - sessionStart) / 60000)
      }
    }
    sorted.forEach(e => {
      const t = new Date(e.created_at)
      if (sessionStart && t - sessionEnd > 30 * 60000) flush(), (sessionStart = null)
      if (!sessionStart) sessionStart = t
      sessionEnd = t
    })
    flush()
  })
  const avgSessionByDay = Object.entries(sessionDurationsByDay).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, durations]) => ({ date: date.slice(5), minutes: Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10 }))

  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0))
  events.forEach(e => {
    const d = new Date(e.created_at)
    heatmap[d.getDay()][d.getHours()]++
  })

  const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 })
  const allEventsRes = await service.from('admin_events').select('user_id, created_at')
  const allEvents = allEventsRes.data || []
  const eventsByUser = {}
  allEvents.forEach(e => { (eventsByUser[e.user_id] ||= []).push(new Date(e.created_at)) })

  const cohorts = {}
  users.users.forEach(u => {
    const signup = new Date(u.created_at)
    const key = `${signup.getFullYear()}-${String(signup.getMonth() + 1).padStart(2, '0')}`
    cohorts[key] ||= { month: key, total: 0, d1: 0, d7: 0, d30: 0 }
    cohorts[key].total++
    const userEvents = eventsByUser[u.id] || []
    const returnedAfter = days => userEvents.some(t => (t - signup) >= days * 86400000)
    if (returnedAfter(1)) cohorts[key].d1++
    if (returnedAfter(7)) cohorts[key].d7++
    if (returnedAfter(30)) cohorts[key].d30++
  })
  const retention = Object.values(cohorts).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12).map(c => ({
    month: c.month, total: c.total,
    d1Pct: c.total ? Math.round((c.d1 / c.total) * 100) : 0,
    d7Pct: c.total ? Math.round((c.d7 / c.total) * 100) : 0,
    d30Pct: c.total ? Math.round((c.d30 / c.total) * 100) : 0,
  }))

  const totalUsers = users.users.length
  const everByEvent = {}
  const { data: adoptionEvents } = await service.from('admin_events').select('user_id, event_name')
  ;(adoptionEvents || []).forEach(e => { (everByEvent[e.event_name] ||= new Set()).add(e.user_id) })
  const featureAdoption = ADOPTION_EVENTS.map(a => ({ label: a.label, pct: totalUsers ? Math.round(((everByEvent[a.key]?.size || 0) / totalUsers) * 100) : 0 }))

  return { topPages, topActions, avgSessionByDay, heatmap, retention, featureAdoption }
}

async function health(service) {
  const [database, auth, pagespeed, groq, cron] = await Promise.all([
    timed(async () => { const { error } = await service.from('organizations').select('id').limit(1); if (error) throw error }),
    timed(async () => { const { error } = await service.auth.admin.listUsers({ perPage: 1 }); if (error) throw error }),
    timed(async () => {
      const r = await fetchWithTimeout('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com', {}, 8000)
      if (!r) throw new Error('Geen respons')
    }),
    timed(async () => {
      if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY niet ingesteld')
      const r = await fetchWithTimeout('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } }, 8000)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
    }),
    timed(async () => {
      const { data, error } = await service.from('website_checks').select('checked_at').order('checked_at', { ascending: false }).limit(1)
      if (error) throw error
      if (!data?.length) throw new Error('Nog geen checks uitgevoerd')
      const hoursAgo = (Date.now() - new Date(data[0].checked_at).getTime()) / 3600000
      if (hoursAgo > 30) throw new Error(`Laatste run ${Math.round(hoursAgo)}u geleden — cron lijkt niet te draaien`)
    }),
  ])
  return {
    checks: [
      { name: 'Database connectie', ...database },
      { name: 'Supabase Auth', ...auth },
      { name: 'PageSpeed API', ...pagespeed },
      { name: 'Groq AI API', ...groq },
      { name: 'Vercel Cron (website monitor)', ...cron },
      { name: 'E-mailservice', status: 'not_configured', ms: null },
    ],
  }
}

async function errorsList(service) {
  const { data, error } = await service.from('system_errors').select('*').order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  return { errors: data }
}

async function impersonationLog(service) {
  const { data, error } = await service.from('impersonation_log').select('*, organizations(name)').order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return { log: data }
}

// Elke resource-handler heeft de vorm (service, query) => Promise<object>.
const RESOURCES = {
  overview: (service) => overview(service),
  'list-accounts': (service) => listAccounts(service),
  workspaces: (service) => workspaces(service),
  stats: (service, q) => stats(service, q.from, q.to),
  health: (service) => health(service),
  'user-detail': (service, q) => userDetail(service, q.userId),
  'workspace-detail': (service, q) => workspaceDetail(service, q.organizationId),
  'onboarding-stats': (service) => computeOnboardingFunnel(service),
  errors: (service) => errorsList(service),
  'impersonation-log': (service) => impersonationLog(service),
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireAdmin(req)
    const q = req.query || {}
    const handler = RESOURCES[q.resource]
    if (!handler) return res.status(400).json({ error: 'Onbekende resource.' })
    const result = await handler(service, q)
    res.status(200).json(result)
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
