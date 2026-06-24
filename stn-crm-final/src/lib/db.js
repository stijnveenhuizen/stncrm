import { supabase } from './supabase'

// ── Clients ────────────────────────────────────────────────────────────────────
export async function getClients() {
  const { data, error } = await supabase
    .from('clients').select('*').order('created_at', { ascending: false })
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
export async function inviteClientPortal(client) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email: client.email,
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin, data: { portal_client_id: client.id } }
  })
  if (error) throw error
  return data
}
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
export async function getClientHosting(clientId) {
  const { data, error } = await supabase
    .from('client_hosting').select('*').eq('client_id', clientId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function revokeClientPortal(clientId) {
  const { data, error } = await supabase.from('clients').update({ auth_user_id: null }).eq('id', clientId).select().single()
  if (error) throw error
  return data
}

// ── Organisaties & team ──────────────────────────────────────────────────────────
export async function createOrganization(name) {
  const existing = await getProfile((await supabase.auth.getUser()).data.user.id)
  if (existing) throw new Error('Dit account heeft al een team-profiel.')
  const { data: org, error: orgErr } = await supabase.from('organizations').insert([{ name }]).select().single()
  if (orgErr) throw orgErr
  const userId = (await supabase.auth.getUser()).data.user.id
  const { data: profile, error: profErr } = await supabase
    .from('profiles').insert([{ id: userId, organization_id: org.id, role: 'owner' }]).select().single()
  if (profErr) throw profErr
  return { org, profile }
}
export async function linkTeamMemberAccount(organizationId) {
  const userId = (await supabase.auth.getUser()).data.user.id
  const { data, error } = await supabase
    .from('profiles').insert([{ id: userId, organization_id: organizationId, role: 'member' }]).select().single()
  if (error) throw error
  return data
}
export async function getOrgMembers() {
  const { data, error } = await supabase.from('profiles').select('*').order('role', { ascending: true })
  if (error) throw error
  return data
}
export async function getOrganization(id) {
  const { data, error } = await supabase.from('organizations').select('*').eq('id', id).single()
  if (error) throw error
  return data
}
export async function updateMemberRole(profileId, role) {
  const { data, error } = await supabase.from('profiles').update({ role }).eq('id', profileId).select().single()
  if (error) throw error
  return data
}

// ── Projects ───────────────────────────────────────────────────────────────────
export async function getProjects() {
  const { data, error } = await supabase
    .from('projects').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
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
export async function getAllTasks() {
  const { data, error } = await supabase
    .from('tasks').select('*, projects(id, name, color, client_id)').order('created_at', { ascending: true })
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
export async function getAllInvoices() {
  const { data, error } = await supabase
    .from('invoices').select('*, clients(fname, lname, company)').order('date', { ascending: false })
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
export async function getAllRecurring() {
  const { data, error } = await supabase
    .from('recurring').select('*, clients(fname, lname)').order('created_at', { ascending: false })
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
export async function getAllHosting() {
  const { data, error } = await supabase
    .from('hosting').select('*, clients(fname, lname, company)').order('domain_expires', { ascending: true, nullsFirst: false })
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
export async function getAllMeetings() {
  const { data, error } = await supabase
    .from('meetings').select('*, clients(fname, lname, company)').order('meeting_date', { ascending: true })
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
export async function getPipeline() {
  const { data, error } = await supabase
    .from('pipeline').select('*').order('created_at', { ascending: false })
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
  // Create client from prospect
  const { data: client, error } = await supabase.from('clients').insert([{
    fname: prospect.fname,
    lname: prospect.lname,
    company: prospect.company || null,
    email: prospect.email || null,
    phone: prospect.phone || null,
    website: prospect.website || null,
    status: 'actief'
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
