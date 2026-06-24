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
    .from('project_documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
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
export async function getMyOrganizations() {
  const { data, error } = await supabase
    .from('memberships').select('role, organizations(*)').order('created_at', { ascending: true })
  if (error) throw error
  return data.map(m => ({ ...m.organizations, myRole: m.role }))
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
  let query = supabase.from('projects').select('*, clients!inner(organization_id)').order('created_at', { ascending: false })
  if (organizationId) query = query.eq('clients.organization_id', organizationId)
  const { data, error } = await query
  if (error) throw error
  return data.map(({ clients, ...p }) => p)
}
export async function createProject(project) {
  const { data, error } = await supabase.from('projects').insert([project]).select().single()
  if (error) throw error
  return data
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

// ── Tasks ──────────────────────────────────────────────────────────────────────
export async function getTasks(projectId) {
  const { data, error } = await supabase
    .from('tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: true })
  if (error) throw error
  return data
}
export async function getAllTasks(organizationId) {
  const { data, error } = await supabase
    .from('tasks').select('*, projects!inner(id, name, color, client_id, clients!inner(organization_id))').eq('projects.clients.organization_id', organizationId).order('created_at', { ascending: true })
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
