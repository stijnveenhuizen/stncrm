import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import * as db from '../lib/db'
import { money, fdate, Badge, MeetingTypeIcon, buildMeetingCalendarUrl, ToastProvider, showToast } from './Dashboard.jsx'

const CSS = `
  .cp{min-height:100vh;background:var(--bg)}
  .cp-topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:0 26px;height:56px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
  .cp-logo{display:flex;align-items:center;gap:10px}
  .cp-logo-icon{width:32px;height:32px;border-radius:8px;background:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .cp-logo-icon span{color:#fff;font-size:15px;font-family:var(--heading-font);font-weight:700}
  .cp-logo h1{font-size:14px;font-weight:700;letter-spacing:-.02em;font-family:var(--heading-font)}
  .cp-logo span:last-child{font-size:10px;color:var(--text-faint)}
  .cp-topbar-right{display:flex;align-items:center;gap:12px}
  .btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--rsm);font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;border:1px solid transparent;line-height:1;white-space:nowrap}
  .btn-ghost{background:none;border-color:var(--border-strong);color:var(--text-muted)}.btn-ghost:hover{background:var(--accent-soft);color:var(--accent-text);border-color:var(--accent)}
  .btn-sm{padding:5px 11px;font-size:12px}.btn-xs{padding:3px 8px;font-size:11px}
  .content{padding:26px;max-width:760px;margin:0 auto}
  .sc{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:16px;overflow:hidden;box-shadow:var(--shadow)}
  .sc-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)}
  .sc-title{font-size:13px;font-weight:600;font-family:var(--heading-font);display:flex;align-items:center;gap:8px}
  .sc-body{padding:16px 18px}
  .badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:500;line-height:1.5}
  .bg-green{background:var(--green-soft);color:var(--green-text)}.bg-amber{background:var(--amber-soft);color:var(--amber-text)}
  .bg-red{background:var(--red-soft);color:var(--red-text)}.bg-blue{background:var(--blue-soft);color:var(--blue-text)}
  .bg-gray{background:var(--bg2);color:var(--text-muted)}
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
  .tabs{display:flex;gap:2px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rsm);padding:3px;width:fit-content}
  .tab{padding:5px 13px;border-radius:5px;font-size:12px;font-weight:500;color:var(--text-muted);cursor:pointer;border:none;background:none;transition:all .1s}
  .tab.active{background:var(--surface);color:var(--text);box-shadow:var(--shadow);font-weight:600}

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
  const [tasks, setTasks] = useState([])
  const [notes, setNotes] = useState([])
  const [meetings, setMeetings] = useState([])
  const [invoices, setInvoices] = useState([])
  const [hosting, setHosting] = useState([])
  const [loading, setLoading] = useState(true)
  const [newTask, setNewTask] = useState('')

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
    db.getInvoices(client.id).then(setInvoices)
    db.getClientHosting(client.id).then(setHosting)
  }, [client.id])

  const refreshTasks = useCallback(() => {
    if (activeProjectId) db.getTasks(activeProjectId).then(setTasks)
  }, [activeProjectId])

  useEffect(() => { refreshTasks() }, [refreshTasks])

  async function toggleTask(t) {
    await db.updateTask(t.id, { done: !t.done })
    refreshTasks()
  }

  async function addTask() {
    if (!newTask.trim() || !activeProjectId) return
    await db.createTask({ project_id: activeProjectId, description: newTask.trim(), priority: 'normaal', done: false, visible_to_client: true, created_by: 'client' })
    setNewTask('')
    refreshTasks()
    showToast('Taak toegevoegd')
  }

  async function logout() { await supabase.auth.signOut() }

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text-muted)',fontSize:13}}>Laden…</div>

  const activeProject = projects.find(p => p.id === activeProjectId)
  const open = tasks.filter(t => !t.done)
  const done = tasks.filter(t => t.done)
  const pct = tasks.length ? Math.round(done.length / tasks.length * 100) : 0
  const paidAmt = invoices.filter(i => i.status === 'betaald').reduce((s,i) => s + Number(i.amount), 0)
  const openAmt = invoices.filter(i => ['verzonden','te laat'].includes(i.status)).reduce((s,i) => s + Number(i.amount), 0)

  return (
    <ToastProvider>
    <div className="cp">
      <style>{CSS}</style>
      <div className="cp-topbar">
        <div className="cp-logo">
          <div className="cp-logo-icon"><span>S</span></div>
          <div><h1>STN CRM</h1><span>Klantportaal</span></div>
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

            {activeProject && <>
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

              <div className="sc">
                <div className="sc-head"><span className="sc-title">Taken</span></div>
                <div className="sc-body">
                  {!tasks.length ? <div className="empty">Nog geen taken</div> : <>
                    {open.map(t => (
                      <div key={t.id} className="task-item">
                        <button type="button" className="task-check" onClick={()=>toggleTask(t)} role="checkbox" aria-checked="false" aria-label={`"${t.description}" markeren als afgerond`}></button>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13}}>{t.description}</div>
                          <div className="task-meta">
                            {t.due_date && <span>{fdate(t.due_date)}</span>}
                            {t.created_by==='client' && <span className="badge bg-blue" style={{fontSize:10}}>Door jou</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                    {done.length > 0 && <div style={{padding:'10px 0 4px',fontSize:11,fontWeight:600,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.05em'}}>Afgerond ({done.length})</div>}
                    {done.map(t => (
                      <div key={t.id} className="task-item">
                        <button type="button" className="task-check done" onClick={()=>toggleTask(t)} role="checkbox" aria-checked="true" aria-label={`"${t.description}" markeren als niet afgerond`}><span style={{color:'#fff',fontSize:10}}>✓</span></button>
                        <div style={{flex:1}}><div style={{fontSize:13,textDecoration:'line-through',color:'var(--text-faint)'}}>{t.description}</div></div>
                      </div>
                    ))}
                  </>}
                </div>
                <div className="quick-add">
                  <input type="text" value={newTask} onChange={e=>setNewTask(e.target.value)} placeholder="Taak voor je webdesigner…" onKeyDown={e=>e.key==='Enter'&&addTask()} />
                  <button className="btn btn-ghost btn-sm" onClick={addTask}>Voeg toe</button>
                </div>
              </div>
            </>}
          </>
        )}

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

        <div className="sc">
          <div className="sc-head"><span className="sc-title">Facturen</span></div>
          <div className="sc-body">
            {!invoices.length ? <div className="empty">Geen facturen</div> : invoices.map(i => (
              <div key={i.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                <div><div style={{fontSize:13,fontWeight:500}}>{i.description}</div><div style={{fontSize:11,color:'var(--text-faint)'}}>{fdate(i.date)}</div></div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontFamily:'var(--mono-font)',fontSize:13}}>{money(i.amount)}</span>
                  <Badge s={i.status} />
                </div>
              </div>
            ))}
          </div>
          {invoices.length > 0 && <div className="total-bar"><span>Betaald <strong>{money(paidAmt)}</strong></span><span>Openstaand <strong style={{color:'var(--amber-text)'}}>{money(openAmt)}</strong></span></div>}
        </div>

        <div className="sc">
          <div className="sc-head"><span className="sc-title">Hosting</span></div>
          <div className="sc-body">
            {!hosting.length ? <div className="empty">Geen hosting gekoppeld</div> : hosting.map(h => (
              <div key={h.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                <div style={{fontWeight:500,fontSize:13}}>{h.site_name}</div>
                {h.url && <a href={h.url} target="_blank" rel="noreferrer" style={{fontSize:12,color:'var(--blue-text)'}}>{h.url}</a>}
                <div style={{fontSize:11,color:'var(--text-faint)',marginTop:3}}>
                  {h.domain && <span>{h.domain}</span>}
                  {h.domain_expires && <span> · Domein verloopt {fdate(h.domain_expires)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </ToastProvider>
  )
}
