import { supabase } from './supabase'

// ── Clients ────────────────────────────────────────────────────────────────────
export async function getClients(organizationId) {
  const { data, error } = await supabase
    .from('clients').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createClient(client) {
  const { data, error } = await supabase.from('clients').insert([client]).select().single()
  if (error) throw error
  return data
}
export async function updateClient(id, updates) {
  const { data, error } = await supabase.from('clients').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteClient(id) {
  const { error } = await supabase.from('clients').delete().eq('id', id)
  if (error) throw error
}

// ── Client portal ──────────────────────────────────────────────────────────────
// Klant-uitnodiging gebeurt nu per project (zie inviteClientToProject hieronder) —
// dat regelt zowel de account-koppeling als de toegang tot dat ene project.
export async function linkClientPortalAccount(clientId) {
  const { data, error } = await supabase.from('clients').update({ auth_user_id: (await supabase.auth.getUser()).data.user.id }).eq('id', clientId).select().single()
  if (error) throw error
  return data
}
export async function getClientByAuthUserId(authUserId) {
  const { data, error } = await supabase.from('clients').select('*').eq('auth_user_id', authUserId).maybeSingle()
  if (error) throw error
  return data
}

// ── Project members (meerdere collega's per project) ────────────────────────────
export async function getProjectMembers(projectId) {
  const { data, error } = await supabase.from('project_members').select('user_id, profiles(*)').eq('project_id', projectId)
  if (error) throw error
  return data.map(m => m.profiles).filter(Boolean)
}
export async function addProjectMember(projectId, userId) {
  const { error } = await supabase.from('project_members').upsert([{ project_id: projectId, user_id: userId }], { onConflict: 'project_id,user_id', ignoreDuplicates: true })
  if (error) throw error
}
export async function removeProjectMember(projectId, userId) {
  const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
  if (error) throw error
}

// ── Project-scoped klantportaal-toegang ──────────────────────────────────────────
export async function inviteClientToProject(project, client) {
  const { error } = await supabase.auth.signInWithOtp({
    email: client.email,
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin, data: { portal_client_id: client.id, portal_project_id: project.id } }
  })
  if (error) throw error
}
export async function grantProjectAccess(projectId, clientId) {
  const { error } = await supabase.from('project_client_access').upsert([{ project_id: projectId, client_id: clientId }], { onConflict: 'project_id,client_id', ignoreDuplicates: true })
  if (error) throw error
}
export async function revokeProjectAccess(projectId, clientId) {
  const { error } = await supabase.from('project_client_access').delete().eq('project_id', projectId).eq('client_id', clientId)
  if (error) throw error
}
export async function getProjectClientAccess(projectId) {
  const { data, error } = await supabase.from('project_client_access').select('client_id').eq('project_id', projectId)
  if (error) throw error
  return data.map(r => r.client_id)
}

// ── Project-documenten ───────────────────────────────────────────────────────────
export async function getProjectDocuments(projectId) {
  const { data, error } = await supabase
    .from('project_documents').select('*, profiles(full_name), clients!project_documents_uploaded_by_client_id_fkey(fname, lname)').eq('project_id', projectId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function uploadProjectDocument(projectId, file, visibleToClient) {
  const userId = (await supabase.auth.getUser()).data.user.id
  const path = `${projectId}/${crypto.randomUUID()}-${file.name}`
  const { error: upErr } = await supabase.storage.from('project-docs').upload(path, file)
  if (upErr) throw upErr
  const { data, error } = await supabase.from('project_documents').insert([{
    project_id: projectId, uploaded_by: userId, file_name: file.name, storage_path: path, file_size: file.size, visible_to_client: !!visibleToClient
  }]).select().single()
  if (error) throw error
  return data
}
export async function getAllProjectDocuments(organizationId) {
  const { data, error } = await supabase
    .from('project_documents').select('*, projects!inner(id, name, organization_id), clients!project_documents_uploaded_by_client_id_fkey(fname, lname)').eq('projects.organization_id', organizationId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function uploadProjectDocumentAsClient(projectId, file, clientId) {
  const path = `${projectId}/${crypto.randomUUID()}-${file.name}`
  const { error: upErr } = await supabase.storage.from('project-docs').upload(path, file)
  if (upErr) throw upErr
  const { data, error } = await supabase.from('project_documents').insert([{
    project_id: projectId, uploaded_by_client_id: clientId, file_name: file.name, storage_path: path, file_size: file.size, visible_to_client: true
  }]).select().single()
  if (error) throw error
  return data
}
export async function getProjectDocumentUrl(storagePath) {
  const { data, error } = await supabase.storage.from('project-docs').createSignedUrl(storagePath, 60)
  if (error) throw error
  return data.signedUrl
}
export async function updateProjectDocument(id, updates) {
  const { data, error } = await supabase.from('project_documents').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteProjectDocument(id, storagePath) {
  await supabase.storage.from('project-docs').remove([storagePath])
  const { error } = await supabase.from('project_documents').delete().eq('id', id)
  if (error) throw error
}

// ── Organisaties & team (een account kan lid zijn van meerdere organisaties) ────
export async function createOrganization(name) {
  const userId = (await supabase.auth.getUser()).data.user.id
  // Profiel is nu puur persoonlijke voorkeuren (naam/thema/etc) — los van organisaties.
  await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
  // Het ID zelf genereren i.p.v. het via .select() terug te laten geven: direct na de
  // insert mag je de organisatie nog niet "zien" (de membership-rij die dat regelt
  // bestaat dan nog niet), dus een .select() hier zou de RLS-policy laten falen.
  const orgId = crypto.randomUUID()
  const { error: orgErr } = await supabase.from('organizations').insert([{ id: orgId, name }])
  if (orgErr) throw orgErr
  const { error: memErr } = await supabase
    .from('memberships').insert([{ user_id: userId, organization_id: orgId, role: 'owner' }])
  if (memErr) throw memErr
  const org = await getOrganization(orgId)
  return { org }
}
export async function linkTeamMemberAccount(organizationId) {
  const userId = (await supabase.auth.getUser()).data.user.id
  await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })
  const { data, error } = await supabase
    .from('memberships').insert([{ user_id: userId, organization_id: organizationId, role: 'member' }]).select().single()
  if (error) throw error
  return data
}
export async function updateOrganization(organizationId, updates) {
  const { data, error } = await supabase.from('organizations').update(updates).eq('id', organizationId).select().single()
  if (error) throw error
  return data
}
export async function getMyOrganizations() {
  const { data, error } = await supabase
    .from('memberships').select('role, organizations(*)').order('created_at', { ascending: true })
  if (error) throw error
  return data.map(m => ({ ...m.organizations, myRole: m.role }))
}

// ── Onboarding ───────────────────────────────────────────────────────────────────
export async function trackOnboardingEvent(workspaceId, step, action) {
  const userId = (await supabase.auth.getUser()).data.user.id
  const { error } = await supabase.from('onboarding_events').insert([{ user_id: userId, workspace_id: workspaceId, step, action }])
  if (error) throw error
  if (action === 'completed') {
    await supabase.from('organizations').update({ onboarding_step: step }).eq('id', workspaceId)
  }
}
export async function completeOnboarding(organizationId) {
  const { error } = await supabase.from('organizations').update({ onboarding_completed: true }).eq('id', organizationId)
  if (error) throw error
}
export async function skipOnboarding(organizationId) {
  const { error } = await supabase.from('organizations').update({ onboarding_skipped: true }).eq('id', organizationId)
  if (error) throw error
}
export async function restartOnboarding(organizationId) {
  const { error } = await supabase.from('organizations').update({ onboarding_completed: false, onboarding_skipped: false, onboarding_step: null }).eq('id', organizationId)
  if (error) throw error
}

export async function hasDemoData(organizationId) {
  const { count, error } = await supabase.from('clients').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_demo', true)
  if (error) throw error
  return count > 0
}
export async function deleteDemoData(organizationId) {
  const { data: demoClients } = await supabase.from('clients').select('id').eq('organization_id', organizationId).eq('is_demo', true)
  const clientIds = (demoClients || []).map(c => c.id)
  const { data: demoProjects } = await supabase.from('projects').select('id').eq('organization_id', organizationId).eq('is_demo', true)
  const projectIds = (demoProjects || []).map(p => p.id)
  if (projectIds.length) await supabase.from('tasks').delete().in('project_id', projectIds)
  if (clientIds.length) {
    await supabase.from('invoices').delete().in('client_id', clientIds)
    await supabase.from('hosting').delete().in('client_id', clientIds)
  }
  await supabase.from('pipeline').delete().eq('organization_id', organizationId).eq('is_demo', true)
  if (projectIds.length) await supabase.from('projects').delete().in('id', projectIds)
  if (clientIds.length) await supabase.from('clients').delete().in('id', clientIds)
}
export async function createDemoData(organizationId) {
  const c1 = await createClient({ organization_id: organizationId, fname: 'Jan', lname: 'de Vries', company: 'Bakkerij De Vries', email: 'jan@bakkerijdevries-demo.nl', status: 'actief', is_demo: true })
  const c2 = await createClient({ organization_id: organizationId, fname: 'Lisa', lname: 'Smit', company: 'Fitness Studio Smit', email: 'lisa@fitnessstudiosmit-demo.nl', status: 'actief', is_demo: true })
  const p1 = await createProject({ organization_id: organizationId, client_id: c1.id, name: 'Website Bakkerij De Vries', type: 'WordPress', status: 'actief', color: '#2563eb', is_demo: true })
  const p2 = await createProject({ organization_id: organizationId, client_id: c2.id, name: 'Website Fitness Studio Smit', type: 'Webflow', status: 'actief', color: '#7c3aed', is_demo: true })
  await supabase.from('tasks').insert([
    { project_id: p1.id, description: 'Homepage ontwerp goedkeuren', priority: 'normaal', done: true, created_by: 'staff', is_demo: true },
    { project_id: p1.id, description: 'Productenpagina inrichten', priority: 'hoog', done: false, created_by: 'staff', is_demo: true },
    { project_id: p2.id, description: 'Lidmaatschapspagina bouwen', priority: 'normaal', done: false, created_by: 'staff', is_demo: true },
  ])
  const todayStr = new Date().toISOString().slice(0, 10)
  await supabase.from('invoices').insert([
    { client_id: c1.id, description: 'Aanbetaling website', amount: 500, date: todayStr, status: 'betaald', is_demo: true },
    { client_id: c2.id, description: 'Eerste factuur project', amount: 750, date: todayStr, due_date: todayStr, status: 'verzonden', is_demo: true },
  ])
  const sslSoon = new Date(); sslSoon.setDate(sslSoon.getDate() + 45)
  await supabase.from('hosting').insert([
    { client_id: c1.id, site_name: 'Bakkerij De Vries', domain: 'bakkerijdevries-demo.nl', ssl_expires: sslSoon.toISOString().slice(0,10), is_demo: true },
  ])
  await supabase.from('pipeline').insert([
    { organization_id: organizationId, fname: 'Mark', lname: 'Jansen', company: 'Sportschool Jansen', source: 'Website', stage: 'interesse', deal_value: 1200, is_demo: true },
  ])
}

export async function adminGetOnboardingStats() {
  return authedFetch('/api/admin-onboarding-stats')
}
export async function getOrgMembers(organizationId) {
  const { data, error } = await supabase
    .from('memberships').select('role, profiles(*)').eq('organization_id', organizationId).order('role', { ascending: true })
  if (error) throw error
  return data.map(m => ({ ...m.profiles, role: m.role }))
}
export async function getOrganization(id) {
  const { data, error } = await supabase.from('organizations').select('*').eq('id', id).single()
  if (error) throw error
  return data
}
export async function updateMemberRole(userId, organizationId, role) {
  const { data, error } = await supabase
    .from('memberships').update({ role }).eq('user_id', userId).eq('organization_id', organizationId).select().single()
  if (error) throw error
  return data
}

// ── Platform-admin (impersonatie) ───────────────────────────────────────────────
async function authedFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}`, ...(options.headers || {}) }
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'Serverfout')
  return body
}
export async function adminListAccounts() {
  return authedFetch('/api/admin-list-accounts')
}
export async function adminImpersonate(email) {
  return authedFetch('/api/admin-impersonate', { method: 'POST', body: JSON.stringify({ email }) })
}

// ── Projects ───────────────────────────────────────────────────────────────────
// Projects hebben zelf geen organization_id (die hangt af van hun klant) — gescoped
// via een inner join op clients. Projecten zonder klant horen hierdoor bij geen
// enkele werkruimte (zelfde beperking als de RLS-policy in WORKSPACES_SETUP.sql).
// organizationId is optioneel: het klantenportaal (ClientPortal.jsx) heeft geen
// werkruimte-besef, daar regelt RLS (auth_user_id van de klant) de scoping al.
export async function getProjects(organizationId) {
  let query = supabase.from('projects').select('*').order('created_at', { ascending: false })
  if (organizationId) query = query.eq('organization_id', organizationId)
  const { data, error } = await query
  if (error) throw error
  return data
}
export async function createProject(project) {
  // Geen .select() na de insert: de RLS-policy voor het lezen van projecten
  // (can_access_project) verwijst naar de projects-tabel zelf, en die check
  // gebruikt het snapshot van vóór de insert — het net aangemaakte project zou
  // zichzelf dus nooit vinden. De aanroeper (ProjectModal) gebruikt de
  // teruggegeven rij niet, dus simpelweg niets terugvragen lost het op.
  const { error } = await supabase.from('projects').insert([project])
  if (error) throw error
}
export async function updateProject(id, updates) {
  const { data, error } = await supabase.from('projects').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

// ── Projecttemplates ─────────────────────────────────────────────────────────────
export async function getProjectTemplates(organizationId) {
  const { data, error } = await supabase
    .from('project_templates').select('*, project_template_tasks(*)').eq('organization_id', organizationId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createProjectTemplateFromTasks(organizationId, name, tasks) {
  const { data: template, error } = await supabase.from('project_templates').insert([{ organization_id: organizationId, name }]).select().single()
  if (error) throw error
  if (tasks.length) {
    const rows = tasks.map((t, i) => ({ template_id: template.id, description: t.description, priority: t.priority || 'normaal', sort_order: i }))
    const { error: taskErr } = await supabase.from('project_template_tasks').insert(rows)
    if (taskErr) throw taskErr
  }
  return template
}
export async function deleteProjectTemplate(id) {
  const { error } = await supabase.from('project_templates').delete().eq('id', id)
  if (error) throw error
}

// ── Tasks ──────────────────────────────────────────────────────────────────────
export async function getTasks(projectId) {
  const { data, error } = await supabase
    .from('tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: true })
  if (error) throw error
  return data
}
export async function getAllTasks(organizationId) {
  const { data, error } = await supabase
    .from('tasks').select('*, projects!inner(id, name, color, client_id, clients!inner(organization_id)), assignee:profiles!tasks_assigned_to_fkey(full_name)').eq('projects.clients.organization_id', organizationId).order('created_at', { ascending: true })
  if (error) throw error
  return data
}
export async function createTask(task) {
  const { data, error } = await supabase.from('tasks').insert([task]).select().single()
  if (error) throw error
  return data
}
export async function updateTask(id, updates) {
  const { data, error } = await supabase.from('tasks').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function getTaskComments(taskId) {
  const { data, error } = await supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at', { ascending: true })
  if (error) throw error
  return data
}
export async function createTaskComment(comment) {
  const { data, error } = await supabase.from('task_comments').insert([comment]).select().single()
  if (error) throw error
  return data
}
export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

// ── Invoices ───────────────────────────────────────────────────────────────────
export async function getInvoices(clientId) {
  const { data, error } = await supabase
    .from('invoices').select('*').eq('client_id', clientId).order('date', { ascending: false })
  if (error) throw error
  return data
}
export async function getAllInvoices(organizationId) {
  const { data, error } = await supabase
    .from('invoices').select('*, clients!inner(fname, lname, company, organization_id)').eq('clients.organization_id', organizationId).order('date', { ascending: false })
  if (error) throw error
  return data
}
export async function createInvoice(invoice) {
  const { data, error } = await supabase.from('invoices').insert([invoice]).select().single()
  if (error) throw error
  return data
}
export async function updateInvoice(id, updates) {
  const { data, error } = await supabase.from('invoices').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteInvoice(id) {
  const { error } = await supabase.from('invoices').delete().eq('id', id)
  if (error) throw error
}

// ── Offertes ─────────────────────────────────────────────────────────────────────
export async function getQuotes(clientId) {
  const { data, error } = await supabase.from('quotes').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function getAllQuotes(organizationId) {
  const { data, error } = await supabase
    .from('quotes').select('*, clients!inner(fname, lname, company, organization_id)').eq('clients.organization_id', organizationId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createQuote(quote) {
  const { data, error } = await supabase.from('quotes').insert([quote]).select().single()
  if (error) throw error
  return data
}
export async function updateQuote(id, updates) {
  const { data, error } = await supabase.from('quotes').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteQuote(id) {
  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) throw error
}

// ── Recurring ──────────────────────────────────────────────────────────────────
export async function getRecurring(clientId) {
  const { data, error } = await supabase
    .from('recurring').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function getAllRecurring(organizationId) {
  const { data, error } = await supabase
    .from('recurring').select('*, clients!inner(fname, lname, organization_id)').eq('clients.organization_id', organizationId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createRecurring(rec) {
  const { data, error } = await supabase.from('recurring').insert([rec]).select().single()
  if (error) throw error
  return data
}
export async function updateRecurring(id, updates) {
  const { data, error } = await supabase.from('recurring').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteRecurring(id) {
  const { error } = await supabase.from('recurring').delete().eq('id', id)
  if (error) throw error
}

// ── Notes ──────────────────────────────────────────────────────────────────────
export async function getNotes(clientId) {
  const { data, error } = await supabase
    .from('notes').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createNote(note) {
  const { data, error } = await supabase.from('notes').insert([note]).select().single()
  if (error) throw error
  return data
}
export async function deleteNote(id) {
  const { error } = await supabase.from('notes').delete().eq('id', id)
  if (error) throw error
}

// ── Recurring invoice processing ───────────────────────────────────────────────
const FREQ_MONTHS = { maandelijks: 1, kwartaallijks: 3, jaarlijks: 12 }

function addMonths(dateStr, n) {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + n)
  return d.toISOString().slice(0, 10)
}

export function nextDueDate(r) {
  if (r.status === 'gestopt') return null
  const step = FREQ_MONTHS[r.freq] || 1
  let d = r.start_date
  const today = new Date().toISOString().slice(0, 10)
  while (d <= today) d = addMonths(d, step)
  if (r.end_date && d > r.end_date) return null
  return d
}

export async function processRecurringForClient(clientId) {
  const recurring = await getRecurring(clientId)
  const invoices = await getInvoices(clientId)
  const today = new Date().toISOString().slice(0, 10)

  for (const r of recurring) {
    if (r.status === 'gestopt') continue
    const step = FREQ_MONTHS[r.freq] || 1
    let d = r.start_date
    const endDate = r.end_date || today
    while (d <= endDate) {
      const already = invoices.some(i => i.recurring_id === r.id && i.date === d)
      if (!already) {
        await createInvoice({
          client_id: clientId,
          description: r.description + ' (' + r.freq + ')',
          amount: r.amount,
          date: d,
          due_date: addMonths(d, 1),
          status: 'verzonden',
          recurring_id: r.id
        })
      }
      d = addMonths(d, step)
    }
  }
}

export function calcMRR(recurringList) {
  return recurringList
    .filter(r => r.status === 'actief')
    .reduce((s, r) => s + Number(r.amount) / (FREQ_MONTHS[r.freq] || 1), 0)
}

// ── Hosting ────────────────────────────────────────────────────────────────────
export async function getAllHosting(organizationId) {
  const { data, error } = await supabase
    .from('hosting').select('*, clients!inner(fname, lname, company, organization_id)').eq('clients.organization_id', organizationId).order('domain_expires', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}
export async function getHostingForClient(clientId) {
  const { data, error } = await supabase
    .from('hosting').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createHosting(item) {
  const { data, error } = await supabase.from('hosting').insert([item]).select().single()
  if (error) throw error
  return data
}
export async function updateHosting(id, updates) {
  const { data, error } = await supabase.from('hosting').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteHosting(id) {
  const { error } = await supabase.from('hosting').delete().eq('id', id)
  if (error) throw error
}

// ── Profiles ───────────────────────────────────────────────────────────────────
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).single()
  if (error && error.code !== 'PGRST116') throw error
  return data
}
export async function upsertProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles').upsert({ id: userId, ...updates, updated_at: new Date().toISOString() }).select().single()
  if (error) throw error
  return data
}
export async function uploadAvatar(userId, file) {
  const ext = file.name.split('.').pop()
  const path = `${userId}/avatar.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return data.publicUrl + '?t=' + Date.now()
}

// ── Invite user ────────────────────────────────────────────────────────────────
export async function inviteUser(email) {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email)
  if (error) throw error
  return data
}

export async function listUsers() {
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) throw error
  return data.users
}

// ── Meetings ───────────────────────────────────────────────────────────────────
export async function getMeetings(clientId) {
  const { data, error } = await supabase
    .from('meetings').select('*').eq('client_id', clientId).order('meeting_date', { ascending: true })
  if (error) throw error
  return data
}
export async function getAllMeetings(organizationId) {
  const { data, error } = await supabase
    .from('meetings').select('*, clients!inner(fname, lname, company, organization_id)').eq('clients.organization_id', organizationId).order('meeting_date', { ascending: true })
  if (error) throw error
  return data
}
export async function createMeeting(meeting) {
  const { data, error } = await supabase.from('meetings').insert([meeting]).select().single()
  if (error) throw error
  return data
}
export async function updateMeeting(id, updates) {
  const { data, error } = await supabase.from('meetings').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteMeeting(id) {
  const { error } = await supabase.from('meetings').delete().eq('id', id)
  if (error) throw error
}

// ── Pipeline ───────────────────────────────────────────────────────────────────
export async function getPipeline(organizationId) {
  const { data, error } = await supabase
    .from('pipeline').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createProspect(prospect) {
  const { data, error } = await supabase.from('pipeline').insert([prospect]).select().single()
  if (error) throw error
  return data
}
export async function updateProspect(id, updates) {
  const { data, error } = await supabase.from('pipeline').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteProspect(id) {
  const { error } = await supabase.from('pipeline').delete().eq('id', id)
  if (error) throw error
}
export async function convertToClient(prospect) {
  // Create client from prospect (zelfde organisatie als de lead)
  const { data: client, error } = await supabase.from('clients').insert([{
    fname: prospect.fname,
    lname: prospect.lname,
    company: prospect.company || null,
    email: prospect.email || null,
    phone: prospect.phone || null,
    website: prospect.website || null,
    status: 'actief',
    organization_id: prospect.organization_id
  }]).select().single()
  if (error) throw error
  // Mark prospect as converted
  await supabase.from('pipeline').update({ stage: 'klant', converted_client_id: client.id }).eq('id', prospect.id)
  return client
}

// ── Pipeline Tasks ─────────────────────────────────────────────────────────────
export async function getPipelineTasks(prospectId) {
  const { data, error } = await supabase
    .from('pipeline_tasks').select('*').eq('prospect_id', prospectId).order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}
export async function getAllPipelineTasks() {
  const { data, error } = await supabase
    .from('pipeline_tasks').select('*, pipeline(fname, lname, company, stage)').eq('done', false).order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}
export async function createPipelineTask(task) {
  const { data, error } = await supabase.from('pipeline_tasks').insert([task]).select().single()
  if (error) throw error
  return data
}
export async function updatePipelineTask(id, updates) {
  const { data, error } = await supabase.from('pipeline_tasks').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deletePipelineTask(id) {
  const { error } = await supabase.from('pipeline_tasks').delete().eq('id', id)
  if (error) throw error
}

// ── Bedrijfsinstellingen ──────────────────────────────────────────────────────
export async function getCompanySettings(organizationId) {
  const { data, error } = await supabase.from('company_settings').select('*').eq('organization_id', organizationId).maybeSingle()
  if (error) throw error
  return data
}
export async function upsertCompanySettings(organizationId, updates) {
  const { data, error } = await supabase
    .from('company_settings').upsert([{ organization_id: organizationId, ...updates, updated_at: new Date().toISOString() }]).select().single()
  if (error) throw error
  return data
}
export async function uploadCompanyLogo(organizationId, file) {
  const ext = file.name.split('.').pop()
  const path = `${organizationId}/logo.${ext}`
  const { error } = await supabase.storage.from('company-logos').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('company-logos').getPublicUrl(path)
  return data.publicUrl + '?t=' + Date.now()
}

// ── Notificaties (live berekend, alleen leesstatus wordt opgeslagen) ───────────
export async function getReadNotificationKeys() {
  const userId = (await supabase.auth.getUser()).data.user.id
  const { data, error } = await supabase.from('notification_reads').select('notification_key').eq('user_id', userId)
  if (error) throw error
  return data.map(r => r.notification_key)
}
export async function markNotificationRead(key) {
  const userId = (await supabase.auth.getUser()).data.user.id
  const { error } = await supabase.from('notification_reads').upsert([{ user_id: userId, notification_key: key }], { onConflict: 'user_id,notification_key', ignoreDuplicates: true })
  if (error) throw error
}

// ── Tijdregistratie ─────────────────────────────────────────────────────────────
export async function getTimeEntries(projectId) {
  const { data, error } = await supabase
    .from('time_entries').select('*, profiles(full_name)').eq('project_id', projectId).order('date', { ascending: false })
  if (error) throw error
  return data
}
export async function createTimeEntry(entry) {
  const userId = (await supabase.auth.getUser()).data.user.id
  const { data, error } = await supabase.from('time_entries').insert([{ ...entry, user_id: userId }]).select().single()
  if (error) throw error
  return data
}
export async function deleteTimeEntry(id) {
  const { error } = await supabase.from('time_entries').delete().eq('id', id)
  if (error) throw error
}
