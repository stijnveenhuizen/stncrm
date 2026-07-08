import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import * as db from '../lib/db'
import { fdate, money, today, Badge, MeetingTypeIcon, buildMeetingCalendarUrl, ToastProvider, showToast, TaskComments, downloadQuotePdf, shadeColor } from './Dashboard.jsx'

const ALLOWED_DOC_TYPES = ['application/pdf','image/png','image/jpeg','image/svg+xml','application/zip','application/x-zip-compressed','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const MAX_DOC_SIZE = 20 * 1024 * 1024

function downloadInvoicePdf(invoice, client, companySettings) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`
    <html><head><title>Factuur ${invoice.invoice_number || ''}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:40px;color:#13121c}
      h1{font-size:20px;margin-bottom:4px}
      .muted{color:#5d5b72;font-size:13px}
      table{width:100%;margin-top:30px;border-collapse:collapse}
      td{padding:8px 0;border-bottom:1px solid #e4e3f0;font-size:14px}
      .right{text-align:right}
      .total{font-weight:700;font-size:16px}
    </style></head><body>
    <h1>Factuur ${invoice.invoice_number || ''}</h1>
    <div class="muted">${client.fname} ${client.lname}${client.company ? ' · ' + client.company : ''}</div>
    <table>
      <tr><td>Omschrijving</td><td class="right">${invoice.description || ''}</td></tr>
      <tr><td>Datum</td><td class="right">${invoice.date || ''}</td></tr>
      <tr><td>Vervaldatum</td><td class="right">${invoice.due_date || ''}</td></tr>
      <tr><td>Status</td><td class="right">${invoice.status}</td></tr>
      <tr><td class="total">Bedrag</td><td class="right total">${money(invoice.amount)}</td></tr>
    </table>
    ${companySettings?.vat_number ? `<div class="muted" style="margin-top:30px">BTW: ${companySettings.vat_number}${companySettings.coc_number ? ' · KVK: ' + companySettings.coc_number : ''}</div>` : ''}
    ${companySettings?.invoice_address ? `<div class="muted">${companySettings.invoice_address.replace(/\n/g,'<br>')}</div>` : ''}
    </body></html>
  `)
  w.document.close()
  w.focus()
  w.print()
}

const CSS = `
  .cp{min-height:100vh;background:var(--bg)}
  .cp-topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:0 26px;height:56px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
  .cp-logo{display:flex;align-items:center;gap:10px}
  .cp-logo-icon{width:32px;height:32px;border-radius:8px;background:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .cp-logo-icon span{color:#fff;font-size:15px;font-family:var(--heading-font);font-weight:700}
  .cp-logo h1{font-size:14px;font-weight:700;letter-spacing:-.02em;font-family:var(--heading-font)}
  .cp-logo span:last-child{font-size:10px;color:var(--text-faint)}
  .cp-topbar-right{display:flex;align-items:center;gap:12px}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:var(--radius-md);font-size:13px;font-weight:500;cursor:pointer;transition:all 120ms ease;border:1px solid transparent;line-height:1;white-space:nowrap}
  .btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:var(--accent-hover)}
  .btn-ghost{background:var(--bg-base);border-color:var(--border-default);color:var(--text-primary)}.btn-ghost:hover{background:var(--bg-subtle)}
  .btn-sm{height:24px;padding:0 10px;font-size:12px}.btn-xs{height:22px;padding:0 8px;font-size:11px}
  .content{padding:26px;max-width:760px;margin:0 auto}
  .sc{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:16px;overflow:hidden;box-shadow:var(--shadow)}
  .sc-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)}
  .sc-title{font-size:13px;font-weight:600;font-family:var(--heading-font);display:flex;align-items:center;gap:8px}
  .sc-body{padding:16px 18px}
  .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:var(--radius-full);font-size:11px;font-weight:500;line-height:1.6;border:1px solid transparent}
  .bg-green{background:var(--green-soft);color:var(--green-text);border-color:#BBF7D0}.bg-amber{background:var(--amber-soft);color:var(--amber-text);border-color:#FDE68A}
  .bg-red{background:var(--red-soft);color:var(--red-text);border-color:#FECACA}.bg-blue{background:var(--blue-soft);color:var(--blue-text);border-color:#BFDBFE}
  .bg-gray{background:var(--bg2);color:var(--text-muted);border-color:var(--border-default)}
  .task-item{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)}
  .task-item:last-child{border-bottom:none}
  .task-check{width:18px;height:18px;border:1.5px solid var(--border-strong);border-radius:5px;flex-shrink:0;margin-top:2px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
  .task-check:hover{border-color:var(--accent)}
  .task-check.done{background:var(--accent);border-color:var(--accent)}
  .task-meta{font-size:11px;color:var(--text-faint);margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .quick-add{display:flex;gap:8px;padding:0 18px 14px}
  .quick-add input[type=text]{flex:1}
  .dl-item{display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}
  .dl-item:last-child{border-bottom:none}
  .total-bar{background:var(--bg2);border-top:1px solid var(--border);padding:11px 18px;display:flex;justify-content:space-between;font-size:13px}
  .total-bar strong{font-family:var(--mono-font)}
  .empty{text-align:center;padding:32px 16px;color:var(--text-faint);font-size:13px}
  .tabs{display:flex;gap:0;border-bottom:1px solid var(--border-default)}
  .tab{padding:8px 14px;margin-bottom:-1px;font-size:13px;font-weight:500;color:var(--text-muted-tok);cursor:pointer;border:none;border-bottom:2px solid transparent;background:none;transition:all 120ms ease}
  .tab:hover{color:var(--text-secondary);background:var(--bg-subtle)}
  .tab.active{color:var(--text-primary);border-bottom-color:var(--accent);font-weight:500;background:none}
  .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:300;padding:16px}
  .modal{background:var(--bg-base);border-radius:var(--radius-xl);padding:24px;max-width:440px;width:100%;box-shadow:var(--shadow-xl);border:1px solid var(--border-default)}
  .modal h2{font-size:17px;margin-bottom:10px;font-family:var(--heading-font)}
  .modal p{font-size:13px;color:var(--text-muted);line-height:1.6;margin-bottom:10px}
  .task-group-label{font-size:11px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:.05em;padding:10px 0 4px}

  @media(max-width:600px){
    .cp-topbar{padding:0 14px;height:52px}
    .content{padding:14px}
    .cp-logo h1{font-size:13px}
    input,textarea,select{font-size:16px;padding:10px 12px}
  }
`

export default function ClientPortal({ session, client }) {
  const [projects, setProjects] = useState([])
  const [activeProjectId, setActiveProjectId] = useState(null)
  const [section, setSection] = useState('overzicht')
  const [tasks, setTasks] = useState([])
  const [invoices, setInvoices] = useState([])
  const [quotes, setQuotes] = useState([])
  const [notes, setNotes] = useState([])
  const [meetings, setMeetings] = useState([])
  const [maintenanceLogs, setMaintenanceLogs] = useState([])
  const [docs, setDocs] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [pendingReview, setPendingReview] = useState(null)
  const fileRef = useRef()

  const loadProjects = useCallback(async () => {
    const p = await db.getProjects()
    setProjects(p)
    setActiveProjectId(prev => prev || (p[0] && p[0].id) || null)
    setLoading(false)
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  useEffect(() => {
    db.getNotes(client.id).then(setNotes)
    db.getMeetings(client.id).then(setMeetings)
    db.getClientMaintenanceLogs(client.id).then(setMaintenanceLogs).catch(() => {})
    db.getInvoices(client.id).then(setInvoices).catch(() => {})
    db.getQuotes(client.id).then(setQuotes).catch(() => {})
    db.getPendingReviewRequest(client.id).then(setPendingReview).catch(() => {})
    if (client.organization_id) db.getCompanySettings(client.organization_id).then(setCompanySettings).catch(() => {})
    try {
      if (!localStorage.getItem('stn_portal_welcome_seen_' + client.id)) setShowWelcome(true)
    } catch (e) {}
  }, [client.id])

  function dismissWelcome() {
    try { localStorage.setItem('stn_portal_welcome_seen_' + client.id, '1') } catch (e) {}
    setShowWelcome(false)
  }

  const refreshTasks = useCallback(() => {
    if (activeProjectId) db.getTasks(activeProjectId).then(setTasks)
  }, [activeProjectId])
  const refreshDocs = useCallback(() => {
    if (activeProjectId) db.getProjectDocuments(activeProjectId).then(setDocs)
  }, [activeProjectId])

  async function handleClientUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!ALLOWED_DOC_TYPES.includes(file.type)) { showToast('Bestandstype niet ondersteund (PDF, PNG, JPG, SVG, ZIP, DOCX).', 'error'); e.target.value=''; return }
    if (file.size > MAX_DOC_SIZE) { showToast('Bestand mag max 20MB zijn.', 'error'); e.target.value=''; return }
    setUploading(true)
    try { await db.uploadProjectDocumentAsClient(activeProjectId, file, client.id); refreshDocs(); showToast('Bestand geüpload') }
    catch (e) { showToast('Fout bij uploaden: ' + e.message, 'error') }
    finally { setUploading(false); e.target.value = '' }
  }

  async function submitReview(score, reviewText, isPublic) {
    try {
      await db.submitReview(pendingReview.id, { score, review_text: reviewText || null, is_public: isPublic })
      setPendingReview(null)
      showToast('Bedankt voor je feedback!')
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  async function respondQuote(q, status) {
    let rejection_reason = null
    if (status === 'afgewezen') rejection_reason = window.prompt('Wil je een reden opgeven? (optioneel)') || null
    try {
      await db.updateQuote(q.id, { status, ...(status === 'geaccepteerd' ? { accepted_at: new Date().toISOString() } : { rejection_reason }) })
      db.getQuotes(client.id).then(setQuotes)
      showToast(status==='geaccepteerd' ? 'Offerte geaccepteerd' : 'Offerte afgewezen')
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  useEffect(() => { refreshTasks(); refreshDocs() }, [refreshTasks, refreshDocs])

  async function openDoc(doc) {
    try { const url = await db.getProjectDocumentUrl(doc.storage_path); window.open(url, '_blank') }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  async function logout() { await supabase.auth.signOut() }

  const whiteLabel = !!(companySettings?.white_label_enabled && companySettings.brand_name)
  useEffect(() => {
    if (!whiteLabel) return
    if (companySettings.primary_color) {
      document.documentElement.style.setProperty('--accent', companySettings.primary_color)
      document.documentElement.style.setProperty('--accent-hover', shadeColor(companySettings.primary_color, -10))
    }
    document.title = `${companySettings.brand_name} — Klantportaal`
    if (companySettings.brand_favicon_url) {
      let link = document.querySelector("link[rel~='icon']")
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
      link.href = companySettings.brand_favicon_url
    }
  }, [whiteLabel, companySettings])

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text-muted)',fontSize:13}}>Laden…</div>

  const activeProject = projects.find(p => p.id === activeProjectId)
  const open = tasks.filter(t => !t.done && !t.in_progress)
  const inProgress = tasks.filter(t => !t.done && t.in_progress)
  const done = tasks.filter(t => t.done)
  const pct = tasks.length ? Math.round(done.length / tasks.length * 100) : 0
  const visibleDocs = docs.filter(d => d.visible_to_client)

  return (
    <ToastProvider>
    <div className="cp">
      <style>{CSS}</style>
      {showWelcome && (
        <div className="modal-bg">
          <div className="modal">
            <h2>Welkom in je klantportaal</h2>
            <p>Hier volg je de voortgang van je project(en): je ziet de status van taken, kunt documenten uitwisselen met je webdesigner, en je facturen inzien.</p>
            <p>Heb je een vraag over een taak? Klik op een taak en plaats een reactie. Wil je iets nieuws laten bouwen of aanpassen? Neem contact op met je webdesigner — nieuwe taken aanmaken kan niet vanuit het portaal.</p>
            <button className="btn btn-primary btn-sm" onClick={dismissWelcome}>Begrepen, aan de slag</button>
          </div>
        </div>
      )}
      {pendingReview && !showWelcome && <ReviewRequestModal review={pendingReview} onSubmit={submitReview} onDismiss={() => setPendingReview(null)} />}
      <div className="cp-topbar">
        <div className="cp-logo">
          {companySettings?.logo_url
            ? <img src={companySettings.logo_url} alt="" style={{height:28,maxWidth:120,objectFit:'contain'}} />
            : <div className="cp-logo-icon"><span>S</span></div>}
          <div><h1>{companySettings?.logo_url ? '' : (whiteLabel ? companySettings.brand_name : 'STN CRM')}</h1><span>Klantportaal</span></div>
        </div>
        <div className="cp-topbar-right">
          <span style={{fontSize:13,color:'var(--text-muted)'}}>{client.fname} {client.lname}</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Uitloggen</button>
        </div>
      </div>

      <div className="content">
        {!projects.length ? (
          <div className="empty">Er is nog geen project aan je account gekoppeld. Neem contact op met je webdesigner.</div>
        ) : (
          <>
            {projects.length > 1 && (
              <div className="tabs" style={{marginBottom:16}}>
                {projects.map(p => <button key={p.id} className={`tab${p.id===activeProjectId?' active':''}`} onClick={()=>setActiveProjectId(p.id)}>{p.name}</button>)}
              </div>
            )}

            <div className="tabs" style={{marginBottom:16}}>
              {[['overzicht','Mijn project'],['taken','Taken'],['facturen','Facturen'],['offertes','Offertes'],['bestanden','Bestanden']].map(([s,label]) => (
                <button key={s} className={`tab${section===s?' active':''}`} onClick={()=>setSection(s)}>{label}</button>
              ))}
            </div>

            {activeProject && section==='overzicht' && (
              <div className="sc">
                <div className="sc-head">
                  <span className="sc-title"><span style={{width:10,height:10,borderRadius:'50%',background:activeProject.color,display:'inline-block'}}></span> {activeProject.name}</span>
                  <Badge s={activeProject.status} />
                </div>
                <div className="sc-body">
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{flex:1,height:6,background:'var(--border)',borderRadius:99}}><div style={{height:'100%',width:pct+'%',background:activeProject.color,borderRadius:99}}></div></div>
                    <span style={{fontSize:12,color:'var(--text-muted)'}}>{pct}%</span>
                  </div>
                  {activeProject.deadline && <div style={{fontSize:12,color:'var(--text-muted)',marginTop:8}}>Deadline: {fdate(activeProject.deadline)}</div>}
                  {activeProject.url && <div style={{fontSize:12,marginTop:6}}><a href={activeProject.url} target="_blank" rel="noreferrer" style={{color:'var(--blue-text)'}}>{activeProject.url} ↗</a></div>}
                </div>
              </div>
            )}

            {activeProject && section==='taken' && (
              <div className="sc">
                <div className="sc-head"><span className="sc-title">Taken</span></div>
                <div className="sc-body">
                  {!tasks.length ? <div className="empty">Nog geen taken</div> : <>
                    {open.length > 0 && <div className="task-group-label">Open ({open.length})</div>}
                    {open.map(t => <PortalTaskRow key={t.id} task={t} client={client} />)}
                    {inProgress.length > 0 && <div className="task-group-label">In behandeling ({inProgress.length})</div>}
                    {inProgress.map(t => <PortalTaskRow key={t.id} task={t} client={client} />)}
                    {done.length > 0 && <div className="task-group-label">Afgerond ({done.length})</div>}
                    {done.map(t => <PortalTaskRow key={t.id} task={t} client={client} done />)}
                  </>}
                </div>
              </div>
            )}

            {activeProject && section==='facturen' && (
              <div className="sc">
                <div className="sc-head"><span className="sc-title">Facturen</span></div>
                <div className="sc-body">
                  {!invoices.length ? <div className="empty">Nog geen facturen</div> : invoices.map(i => (
                    <div key={i.id} className="dl-item" style={{alignItems:'center'}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:500}}>{i.invoice_number ? i.invoice_number+' · ' : ''}{i.description}</div>
                        <div style={{fontSize:11,color:'var(--text-faint)'}}>{fdate(i.date)}{i.due_date ? ' · vervalt ' + fdate(i.due_date) : ''}</div>
                      </div>
                      <span style={{fontFamily:'var(--mono-font)',fontSize:13,marginRight:8}}>{money(i.amount)}</span>
                      <Badge s={i.status} />
                      <button className="btn btn-ghost btn-xs" style={{marginLeft:8}} onClick={()=>downloadInvoicePdf(i, client, companySettings)}>↓ PDF</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeProject && section==='offertes' && (
              <div className="sc">
                <div className="sc-head"><span className="sc-title">Offertes</span></div>
                <div className="sc-body">
                  {!quotes.length ? <div className="empty">Nog geen offertes</div> : quotes.map(q => (
                    <div key={q.id} className="dl-item" style={{alignItems:'center',flexWrap:'wrap'}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:500}}>{q.quote_number ? q.quote_number+' · ' : ''}{q.title || q.description}</div>
                        <div style={{fontSize:11,color:'var(--text-faint)'}}>{q.valid_until ? 'Geldig tot ' + fdate(q.valid_until) : ''}</div>
                      </div>
                      <span style={{fontFamily:'var(--mono-font)',fontSize:13,marginRight:8}}>{money(q.total ?? q.amount)}</span>
                      <Badge s={q.status} />
                      <div style={{display:'flex',gap:6,marginLeft:8}}>
                        <button className="btn btn-ghost btn-xs" onClick={()=>downloadQuotePdf(q, client, companySettings)}>↓ PDF</button>
                        {q.status==='verzonden' && <>
                          <button className="btn btn-primary btn-xs" onClick={()=>respondQuote(q,'geaccepteerd')}>Accepteren</button>
                          <button className="btn btn-ghost btn-xs" onClick={()=>respondQuote(q,'afgewezen')}>Afwijzen</button>
                        </>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeProject && section==='bestanden' && (
              <div className="sc">
                <div className="sc-head">
                  <span className="sc-title">Bestanden</span>
                  <button className="btn btn-ghost btn-sm" onClick={()=>fileRef.current.click()} disabled={uploading}>{uploading?'Uploaden…':'+ Bestand'}</button>
                  <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.svg,.zip,.docx" style={{display:'none'}} onChange={handleClientUpload} />
                </div>
                <div className="sc-body">
                  {!visibleDocs.length ? <div className="empty">Nog geen documenten gedeeld</div> : visibleDocs.map(d => (
                    <div key={d.id} className="dl-item" style={{cursor:'pointer'}} onClick={()=>openDoc(d)}>
                      <span style={{color:'var(--blue-text)',flex:1}}>{d.file_name}</span>
                      <span style={{fontSize:11,color:'var(--text-faint)'}}>{d.clients ? `${d.clients.fname} ${d.clients.lname}` : (d.profiles?.full_name || 'Teamlid')} · {fdate(d.created_at?.slice(0,10))}</span>
                    </div>
                  ))}
                </div>
                <div style={{padding:'0 18px 14px',fontSize:11,color:'var(--text-faint)'}}>Toegestaan: PDF, PNG, JPG, SVG, ZIP, DOCX — max 20MB.</div>
              </div>
            )}
          </>
        )}

        {section==='overzicht' && <>
          <div className="sc">
            <div className="sc-head"><span className="sc-title">Notities</span></div>
            <div className="sc-body">
              {!notes.length ? <div className="empty">Geen notities</div> : notes.map(n => (
                <div key={n.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontSize:13,lineHeight:1.6}}>{n.content.split('\n').map((l,i)=><span key={i}>{l}<br/></span>)}</div>
                  <div style={{fontSize:11,color:'var(--text-faint)',marginTop:5}}>{fdate(n.created_at?.slice(0,10))}</div>
                </div>
              ))}
            </div>
          </div>

          {!!maintenanceLogs.length && (
            <div className="sc">
              <div className="sc-head"><span className="sc-title">Onderhoud aan je website</span></div>
              <div className="sc-body">
                {maintenanceLogs.map(l => (
                  <div key={l.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                    <div style={{fontSize:13,fontWeight:500}}>{l.title}</div>
                    {l.description && <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>{l.description}</div>}
                    <div style={{fontSize:11,color:'var(--text-faint)',marginTop:5}}>{fdate(l.date)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="sc">
            <div className="sc-head"><span className="sc-title">Meetings</span></div>
            <div className="sc-body">
              {!meetings.length ? <div className="empty">Geen meetings</div> : meetings.map(m => (
                <div key={m.id} className="dl-item">
                  <MeetingTypeIcon type={m.type} />
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500}}>{m.title}</div>
                    <div style={{fontSize:11,color:'var(--text-faint)'}}>{fdate(m.meeting_date)}{m.meeting_time ? ' · ' + m.meeting_time.slice(0,5) : ''}</div>
                  </div>
                  {m.status==='gepland' && <a href={buildMeetingCalendarUrl(m, client)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs" style={{textDecoration:'none'}}>Inplannen</a>}
                </div>
              ))}
            </div>
          </div>
        </>}
      </div>
    </div>
    </ToastProvider>
  )
}

function PortalTaskRow({ task, client, done }) {
  return (
    <div className="task-item">
      <div className={`task-check${done?' done':''}`} aria-hidden="true">{done && <span style={{color:'#fff',fontSize:10}}>✓</span>}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:13,textDecoration:done?'line-through':'none',color:done?'var(--text-faint)':'var(--text)'}}>{task.description}</div>
        <div className="task-meta">
          {task.due_date && <span>{fdate(task.due_date)}</span>}
          {task.created_by==='client' && <span className="badge bg-blue" style={{fontSize:10}}>Door jou</span>}
        </div>
        <TaskComments taskId={task.id} authorName={`${client.fname} ${client.lname}`} authorType="client" />
      </div>
    </div>
  )
}

function StarRatingInput({ value, onChange }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <motion.span
          key={n}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          style={{
            fontSize: 32, cursor: 'pointer', lineHeight: 1,
            color: n <= (hover || value) ? '#f5b400' : 'var(--border-strong, #d1d5db)',
            transition: 'color 150ms',
          }}
        >★</motion.span>
      ))}
    </div>
  )
}

function ReviewRequestModal({ review, onSubmit, onDismiss }) {
  const [score, setScore] = useState(0)
  const [text, setText] = useState('')
  const [isPublic, setIsPublic] = useState(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!score) return showToast('Kies eerst een aantal sterren.', 'error')
    setSaving(true)
    try { await onSubmit(score, text.trim(), isPublic === true) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-bg open">
      <div className="modal" style={{ maxWidth: 420, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 4 }}>Hoe was je ervaring{review.projects?.name ? ` met ${review.projects.name}` : ''}?</h2>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0' }}>
          <StarRatingInput value={score} onChange={setScore} />
        </div>
        <textarea
          value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="Vertel ons wat je vond (optioneel)"
          style={{ width: '100%', marginBottom: 14 }}
        />
        <div style={{ fontSize: 13, marginBottom: 16, textAlign: 'left' }}>
          <div style={{ marginBottom: 6, color: 'var(--text-muted)' }}>Mag deze review als testimonial gebruikt worden?</div>
          <label style={{ marginRight: 16 }}><input type="radio" name="public" checked={isPublic === true} onChange={() => setIsPublic(true)} /> Ja, graag</label>
          <label><input type="radio" name="public" checked={isPublic === false} onChange={() => setIsPublic(false)} /> Nee, liever niet</label>
        </div>
        <div className="modal-actions" style={{ justifyContent: 'center' }}>
          <button className="btn btn-ghost" onClick={onDismiss}>Later</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Versturen…' : 'Feedback versturen'}</button>
        </div>
      </div>
    </div>
  )
}
