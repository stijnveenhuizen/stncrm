import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import * as db from '../lib/db'

const money = n => '€\u202f' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fdate = d => { if (!d) return '—'; return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) }
const today = () => new Date().toISOString().slice(0, 10)
const daysN = d => { if (!d) return null; return Math.ceil((new Date(d) - new Date(today())) / 86400000) }
const AVC = ['av-b','av-g','av-p','av-a','av-r','av-t']
const avC = id => { const n = parseInt(String(id).replace(/-/g,'').slice(0,8), 16); return AVC[n % AVC.length] }
const ini = c => ((c.fname||'?')[0] + (c.lname||'?')[0]).toUpperCase()
const PROJ_COLORS = ['#2563eb','#7c3aed','#0d9488','#d97706','#dc2626','#16a34a','#db2777','#1a1a18']
const FREQ_MONTHS = { maandelijks: 1, kwartaallijks: 3, jaarlijks: 12 }

function Badge({ s }) {
  const m = { actief:'bg-green',prospect:'bg-blue',inactief:'bg-gray',betaald:'bg-green',verzonden:'bg-blue','te laat':'bg-red',concept:'bg-gray','on-hold':'bg-amber',afgerond:'bg-green',hoog:'bg-red',laag:'bg-gray',normaal:'bg-blue',gepauzeerd:'bg-amber',gestopt:'bg-gray',maandelijks:'bg-teal',kwartaallijks:'bg-purple',jaarlijks:'bg-blue' }
  return <span className={`badge ${m[s]||'bg-gray'}`}>{s}</span>
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal"><h3>{title}</h3>{children}</div>
    </div>
  )
}

function FG({ label, children }) { return <div className="form-group"><label>{label}</label>{children}</div> }
function FR({ children }) { return <div className="form-row">{children}</div> }
function ModalActions({ onCancel, onSave, saving }) {
  return (
    <div className="modal-actions">
      <button className="btn btn-ghost" onClick={onCancel}>Annuleren</button>
      <button className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
    </div>
  )
}

export default function Dashboard({ session }) {
  const [view, setView] = useState('overview')
  const [curClientId, setCurClientId] = useState(null)
  const [curProjectId, setCurProjectId] = useState(null)
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [allTasks, setAllTasks] = useState([])
  const [allInvoices, setAllInvoices] = useState([])
  const [allRecurring, setAllRecurring] = useState([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    try {
      const [c, p, i, r, t] = await Promise.all([
        db.getClients(), db.getProjects(), db.getAllInvoices(), db.getAllRecurring(), db.getAllTasks()
      ])
      setClients(c); setProjects(p); setAllInvoices(i); setAllRecurring(r)
      setAllTasks(t.map(task => ({ ...task, project: task.projects })))
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  function showView(v, id) {
    setView(v)
    if (v === 'client-detail') setCurClientId(id)
    if (v === 'project-detail') setCurProjectId(id)
    window.scrollTo(0, 0)
  }

  async function logout() { await supabase.auth.signOut() }

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text-muted)',fontSize:13}}>Laden…</div>

  const curClient = clients.find(c => c.id === curClientId)
  const curProject = projects.find(p => p.id === curProjectId)
  const clientName = id => { const c = clients.find(c => c.id === id); return c ? c.fname + ' ' + c.lname : '' }
  const totalPaid = allInvoices.filter(i => i.status === 'betaald').reduce((s,i) => s + Number(i.amount), 0)
  const totalOpen = allInvoices.filter(i => ['verzonden','te laat'].includes(i.status)).reduce((s,i) => s + Number(i.amount), 0)
  const totalMRR = db.calcMRR(allRecurring)

  const CSS = `
    .app{display:flex;min-height:100vh}
    .sidebar{width:216px;min-width:216px;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;height:100vh;z-index:20;overflow-y:auto}
    .main{margin-left:216px;flex:1}
    .sb-logo{padding:18px 16px 14px;border-bottom:1px solid var(--border)}
    .sb-logo h1{font-size:14px;font-weight:600;letter-spacing:-.02em}
    .sb-logo span{font-size:11px;color:var(--text-faint)}
    .sb-nav{flex:1;padding:10px 8px}
    .nav-section{font-size:10px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:.07em;padding:12px 8px 5px}
    .nav-item{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:var(--rsm);color:var(--text-muted);font-size:13px;font-weight:500;cursor:pointer;margin-bottom:1px;width:100%;text-align:left;transition:all .1s;border:none;background:none}
    .nav-item:hover,.nav-item.active{background:var(--accent-soft);color:var(--text)}
    .sb-footer{padding:14px 16px;border-top:1px solid var(--border)}
    .topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;height:54px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
    .topbar h2{font-size:15px;font-weight:600;letter-spacing:-.01em}
    .topbar-right{display:flex;align-items:center;gap:8px}
    .bc{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--text-muted)}
    .bc .crumb{cursor:pointer}.bc .crumb:hover{color:var(--text)}
    .bc .sep{color:var(--text-faint);font-size:11px}
    .bc .bactive{color:var(--text);font-weight:500}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--rsm);font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;border:1px solid transparent;line-height:1;white-space:nowrap}
    .btn-primary{background:var(--text);color:#fff}.btn-primary:hover{opacity:.86}.btn-primary:disabled{opacity:.5;cursor:not-allowed}
    .btn-ghost{background:none;border-color:var(--border-strong);color:var(--text-muted)}.btn-ghost:hover{background:var(--accent-soft);color:var(--text)}
    .btn-danger{background:var(--red-soft);color:var(--red-text)}.btn-danger:hover{background:#fee2e2}
    .btn-sm{padding:4px 10px;font-size:12px}.btn-xs{padding:3px 8px;font-size:11px}
    .content{padding:24px}
    .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
    .stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px}
    .stat-label{font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
    .stat-value{font-size:22px;font-weight:600;letter-spacing:-.03em}
    .stat-sub{font-size:11px;color:var(--text-faint);margin-top:3px}
    .sc{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:14px;overflow:hidden}
    .sc-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)}
    .sc-title{font-size:13px;font-weight:600}
    .sc-body{padding:14px 16px}
    .cl-header{display:grid;grid-template-columns:2fr 1.4fr 0.9fr 1.1fr 80px;padding:8px 18px;background:var(--bg);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}
    .cl-row{display:grid;grid-template-columns:2fr 1.4fr 0.9fr 1.1fr 80px;padding:12px 18px;border-bottom:1px solid var(--border);align-items:center;cursor:pointer;transition:background .1s}
    .cl-row:last-child{border-bottom:none}.cl-row:hover{background:var(--bg)}
    .pl-header{display:grid;grid-template-columns:2fr 1.4fr 1fr 0.8fr 100px;padding:8px 18px;background:var(--bg);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}
    .pl-row{display:grid;grid-template-columns:2fr 1.4fr 1fr 0.8fr 100px;padding:12px 18px;border-bottom:1px solid var(--border);align-items:center;cursor:pointer;transition:background .1s}
    .pl-row:last-child{border-bottom:none}.pl-row:hover{background:var(--bg)}
    .cl-name-cell{display:flex;align-items:center;gap:10px}
    .avatar{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0}
    .av-b{background:#dbeafe;color:#1d4ed8}.av-g{background:#dcfce7;color:#15803d}
    .av-p{background:#ede9fe;color:#6d28d9}.av-a{background:#fef3c7;color:#b45309}
    .av-r{background:#fee2f2;color:#9d174d}.av-t{background:#ccfbf1;color:#0f766e}
    .badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;line-height:1.5}
    .bg-green{background:var(--green-soft);color:var(--green-text)}.bg-amber{background:var(--amber-soft);color:var(--amber-text)}
    .bg-red{background:var(--red-soft);color:var(--red-text)}.bg-blue{background:var(--blue-soft);color:var(--blue-text)}
    .bg-purple{background:var(--purple-soft);color:var(--purple-text)}.bg-teal{background:var(--teal-soft);color:var(--teal-text)}
    .bg-gray{background:var(--accent-soft);color:var(--text-muted)}
    .task-item{display:flex;align-items:flex-start;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)}
    .task-item:last-child{border-bottom:none}
    .task-check{width:17px;height:17px;border:1.5px solid var(--border-strong);border-radius:4px;flex-shrink:0;margin-top:2px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
    .task-check.done{background:var(--text);border-color:var(--text)}
    .task-meta{font-size:11px;color:var(--text-faint);margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .task-del{color:var(--text-faint);font-size:17px;cursor:pointer;opacity:0;transition:opacity .1s;line-height:1;padding:2px 4px}
    .task-item:hover .task-del{opacity:1}
    .info-row{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px}
    .info-row:last-child{border-bottom:none}
    .info-label{color:var(--text-muted);width:100px;flex-shrink:0;padding-top:1px}.info-val{flex:1}
    .detail-grid{display:grid;grid-template-columns:1fr 320px;gap:18px;align-items:start}
    .total-bar{background:var(--bg);border-top:1px solid var(--border);padding:10px 16px;display:flex;justify-content:space-between;font-size:13px}
    .total-bar strong{font-family:'DM Mono',monospace}
    .search-wrap{position:relative}.search-wrap input{padding-left:30px;width:240px}
    .search-icon{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--text-faint);font-size:14px;pointer-events:none}
    .tabs{display:flex;gap:2px;background:var(--bg);border:1px solid var(--border);border-radius:var(--rsm);padding:3px}
    .tab{padding:4px 12px;border-radius:4px;font-size:12px;font-weight:500;color:var(--text-muted);cursor:pointer;border:none;background:none}
    .tab.active{background:var(--surface);color:var(--text);box-shadow:0 1px 2px rgba(0,0,0,.05)}
    .client-tabs{display:flex;border-bottom:1px solid var(--border);overflow-x:auto}
    .client-tab{padding:10px 14px;font-size:13px;font-weight:500;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;background:none;border-top:none;border-left:none;border-right:none;white-space:nowrap}
    .client-tab:hover{color:var(--text)}.client-tab.active{color:var(--text);border-bottom-color:var(--text)}
    .modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.28);z-index:100;align-items:center;justify-content:center}
    .modal-bg.open{display:flex}
    .modal{background:var(--surface);border-radius:var(--r);padding:24px;width:500px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.14)}
    .modal h3{font-size:15px;font-weight:600;margin-bottom:18px;letter-spacing:-.01em}
    .form-group{margin-bottom:13px}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:11px}
    .modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid var(--border)}
    .empty{text-align:center;padding:28px 16px;color:var(--text-faint);font-size:13px}
    .quick-add{display:flex;gap:8px;padding:0 16px 13px}
    .quick-add input[type=text]{flex:1}.quick-add input[type=date]{width:130px}
    .color-opts{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
    .color-opt{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all .1s}
    .color-opt.sel{border-color:var(--text);transform:scale(1.15)}
    .dl-item{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px}
    .dl-item:last-child{border-bottom:none}
    .dl-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
    .chart-wrap{display:flex;align-items:flex-end;gap:5px;height:80px;padding-top:8px}
    .chart-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer}
    .chart-bar{background:var(--text);border-radius:3px 3px 0 0;width:100%;min-height:2px}
    .chart-col:hover .chart-bar{opacity:.7}
    .chart-lbl{font-size:10px;color:var(--text-faint);text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    @media(max-width:768px){
      .sidebar{width:100%;height:auto;position:relative}
      .main{margin-left:0}
      .sb-nav{display:flex;overflow-x:auto;padding:6px}
      .nav-section{display:none}
      .detail-grid{grid-template-columns:1fr}
      .stats-grid{grid-template-columns:1fr 1fr}
      .cl-header div:nth-child(n+2),.cl-row div:nth-child(n+2){display:none}
      .cl-header,.cl-row{grid-template-columns:1fr}
    }
  `

  return (
    <div className="app">
      <style>{CSS}</style>
      <nav className="sidebar">
        <div className="sb-logo"><h1>STN CRM</h1><span>Klantenbeheer</span></div>
        <div className="sb-nav">
          <div className="nav-section">Overzicht</div>
          <button className={`nav-item${view==='overview'?' active':''}`} onClick={() => showView('overview')}>◈ &nbsp;Dashboard</button>
          <div className="nav-section">Beheer</div>
          <button className={`nav-item${['clients','client-detail'].includes(view)?' active':''}`} onClick={() => showView('clients')}>◎ &nbsp;Klanten</button>
          <button className={`nav-item${['projects','project-detail'].includes(view)?' active':''}`} onClick={() => showView('projects')}>▣ &nbsp;Projecten</button>
          <button className={`nav-item${view==='tasks'?' active':''}`} onClick={() => showView('tasks')}>◻ &nbsp;Alle taken</button>
          <button className={`nav-item${view==='finance'?' active':''}`} onClick={() => showView('finance')}>◇ &nbsp;Financiën</button>
        </div>
        <div className="sb-footer">
          <div style={{fontSize:11,color:'var(--text-faint)',marginBottom:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{session.user.email}</div>
          <button className="btn btn-ghost btn-xs" onClick={logout} style={{width:'100%',justifyContent:'center'}}>Uitloggen</button>
        </div>
      </nav>
      <div className="main">
        {view==='overview' && <OverviewView clients={clients} projects={projects} allTasks={allTasks} allInvoices={allInvoices} allRecurring={allRecurring} totalPaid={totalPaid} totalOpen={totalOpen} totalMRR={totalMRR} showView={showView} onRefresh={loadAll} />}
        {view==='clients' && <ClientsView clients={clients} projects={projects} allTasks={allTasks} showView={showView} onRefresh={loadAll} />}
        {view==='client-detail' && curClient && <ClientDetailView client={curClient} projects={projects} allTasks={allTasks} showView={showView} onRefresh={loadAll} />}
        {view==='projects' && <ProjectsView projects={projects} clients={clients} clientName={clientName} showView={showView} onRefresh={loadAll} />}
        {view==='project-detail' && curProject && <ProjectDetailView project={curProject} clients={clients} clientName={clientName} showView={showView} onRefresh={loadAll} />}
        {view==='tasks' && <TasksView allTasks={allTasks} showView={showView} onRefresh={loadAll} />}
        {view==='finance' && <FinanceView allInvoices={allInvoices} allRecurring={allRecurring} totalPaid={totalPaid} totalOpen={totalOpen} totalMRR={totalMRR} showView={showView} />}
      </div>
    </div>
  )
}

function OverviewView({ clients, projects, allTasks, allInvoices, allRecurring, totalPaid, totalOpen, totalMRR, showView, onRefresh }) {
  const openTasks = allTasks.filter(t => !t.done)
  const pDL = projects.filter(p => p.deadline && p.status !== 'afgerond').map(p => ({ name: p.name, deadline: p.deadline, sub: 'Project', tv: 'project-detail', tid: p.id, color: p.color }))
  const tDL = allTasks.filter(t => !t.done && t.due_date).map(t => ({ name: t.description, deadline: t.due_date, sub: t.project?.name || '', tv: 'project-detail', tid: t.project_id, color: t.project?.color || '#888' }))
  const deadlines = [...pDL, ...tDL].sort((a,b) => a.deadline.localeCompare(b.deadline)).slice(0,6)
  const revByClient = clients.map(c => ({ name: (c.company || c.fname+' '+c.lname).slice(0,14), v: allInvoices.filter(i => i.client_id===c.id && i.status==='betaald').reduce((s,i) => s+Number(i.amount),0), id: c.id })).filter(x => x.v>0).sort((a,b) => b.v-a.v).slice(0,8)
  const mx = revByClient.length ? Math.max(...revByClient.map(x => x.v)) : 1
  const activeRec = allRecurring.filter(r => r.status === 'actief')

  return (
    <div>
      <div className="topbar"><h2>Dashboard</h2><div className="topbar-right"><ClientModal onSave={onRefresh} trigger={<button className="btn btn-primary btn-sm">+ Klant</button>} /><ProjectModal clients={clients} onSave={onRefresh} trigger={<button className="btn btn-ghost btn-sm">+ Project</button>} /></div></div>
      <div className="content">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Klanten</div><div className="stat-value">{clients.length}</div><div className="stat-sub">{clients.filter(c=>c.status==='actief').length} actief</div></div>
          <div className="stat-card"><div className="stat-label">Projecten</div><div className="stat-value">{projects.length}</div><div className="stat-sub">{projects.filter(p=>p.status==='actief').length} actief</div></div>
          <div className="stat-card"><div className="stat-label">Omzet betaald</div><div className="stat-value" style={{fontSize:18}}>{money(totalPaid)}</div>{totalOpen>0&&<div className="stat-sub" style={{color:'var(--amber-text)'}}>{money(totalOpen)} nog te ontvangen</div>}</div>
          <div className="stat-card"><div className="stat-label">MRR</div><div className="stat-value" style={{fontSize:18}}>{money(totalMRR)}</div><div className="stat-sub">per maand</div></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
          <div className="sc">
            <div className="sc-head"><span className="sc-title">Aankomende deadlines</span></div>
            <div className="sc-body">
              {!deadlines.length ? <div className="empty">Geen deadlines</div> : deadlines.map((d,i) => {
                const dd=daysN(d.deadline); const dc=dd<0?'var(--red)':dd<=7?'var(--amber)':'var(--green)'; const lc=dd<0?'var(--red-text)':dd<=7?'var(--amber-text)':'var(--text-faint)'
                return <div key={i} className="dl-item"><div className="dl-dot" style={{background:dc}}></div><div style={{flex:1}}><div style={{fontSize:13,cursor:'pointer'}} onClick={()=>showView(d.tv,d.tid)}>{d.name}</div><div style={{fontSize:11,color:'var(--text-faint)'}}>{d.sub}</div></div><div style={{fontSize:12,color:lc,whiteSpace:'nowrap'}}>{dd<0?'Te laat':dd===0?'Vandaag':dd+'d'}</div></div>
              })}
            </div>
          </div>
          <div className="sc">
            <div className="sc-head"><span className="sc-title">Open taken</span></div>
            <div className="sc-body">
              {!openTasks.length ? <div className="empty">Geen open taken</div> : openTasks.slice(0,6).map(t => (
                <div key={t.id} className="task-item">
                  <div className="task-check"></div>
                  <div style={{flex:1}}><div style={{fontSize:13}}>{t.description}</div><div className="task-meta" style={{cursor:'pointer'}} onClick={()=>showView('project-detail',t.project_id)}>{t.project?.name}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16}}>
          <div className="sc">
            <div className="sc-head"><span className="sc-title">Omzet per klant (betaald)</span></div>
            <div className="sc-body">
              {!revByClient.length ? <div className="empty">Nog geen betaalde facturen</div> : <div className="chart-wrap">{revByClient.map(x=><div key={x.id} className="chart-col" title={money(x.v)} onClick={()=>showView('client-detail',x.id)}><div className="chart-bar" style={{height:Math.max(3,Math.round(x.v/mx*72))+'px'}}></div><div className="chart-lbl">{x.name}</div></div>)}</div>}
            </div>
          </div>
          <div className="sc">
            <div className="sc-head"><span className="sc-title">Terugkerende inkomsten</span></div>
            <div className="sc-body">
              {!activeRec.length ? <div className="empty">Geen terugkerende inkomsten</div> : activeRec.slice(0,5).map(r => {
                const nd=db.nextDueDate(r); const dd=nd?daysN(nd):null
                return <div key={r.id} className="dl-item"><div style={{flex:1}}><div style={{fontSize:13}}>{r.description}</div><div style={{fontSize:11,color:'var(--text-faint)'}}>{r.clients?.fname} {r.clients?.lname} · {r.freq}</div></div><div style={{textAlign:'right'}}><div style={{fontFamily:'DM Mono',fontSize:12,fontWeight:500}}>{money(r.amount)}</div>{nd&&<div style={{fontSize:11,color:dd<=7?'var(--amber-text)':'var(--text-faint)'}}>{dd===0?'vandaag':dd+'d'}</div>}</div></div>
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ClientsView({ clients, projects, allTasks, showView, onRefresh }) {
  const [q, setQ] = useState('')
  const filtered = clients.filter(c => !q||(c.fname+c.lname+(c.company||'')+(c.email||'')).toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <div className="topbar"><h2>Klanten</h2><div className="topbar-right"><div className="search-wrap"><span className="search-icon">⌕</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Zoeken…" /></div><ClientModal onSave={onRefresh} trigger={<button className="btn btn-primary btn-sm">+ Nieuwe klant</button>} /></div></div>
      <div className="content">
        <div className="sc" style={{padding:0}}>
          <div className="cl-header"><div>Klant</div><div>Contact</div><div>Status</div><div>Omzet</div><div></div></div>
          {!filtered.length ? <div className="empty">Geen klanten</div> : filtered.map((c,idx) => {
            const pCount=projects.filter(p=>p.client_id===c.id).length
            const openT=allTasks.filter(t=>!t.done&&projects.find(p=>p.id===t.project_id)?.client_id===c.id).length
            return <div key={c.id} className="cl-row" onClick={()=>showView('client-detail',c.id)}>
              <div className="cl-name-cell"><div className={`avatar ${avC(c.id)}`}>{ini(c)}</div><div><div style={{fontWeight:500,fontSize:14}}>{c.fname} {c.lname}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{c.company||'—'}</div></div></div>
              <div style={{fontSize:13,color:'var(--text-muted)'}}>{c.email||'—'}</div>
              <div><Badge s={c.status||'actief'} /></div>
              <div style={{fontFamily:'DM Mono',fontSize:13}}>—</div>
              <div style={{textAlign:'right',display:'flex',gap:4,justifyContent:'flex-end',flexWrap:'wrap'}}>
                {pCount>0&&<span className="badge bg-blue">{pCount} proj</span>}
                {openT>0&&<span className="badge bg-amber">{openT} taken</span>}
              </div>
            </div>
          })}
        </div>
      </div>
    </div>
  )
}

function ClientDetailView({ client, projects, allTasks, showView, onRefresh }) {
  const [activeTab, setActiveTab] = useState('projects')
  const [invoices, setInvoices] = useState([])
  const [recurring, setRecurring] = useState([])
  const [notes, setNotes] = useState([])
  const clientProjects = projects.filter(p => p.client_id === client.id)
  const clientTasks = allTasks.filter(t => clientProjects.some(p => p.id === t.project_id))

  useEffect(() => {
    db.processRecurringForClient(client.id).then(() => {
      db.getInvoices(client.id).then(setInvoices)
      db.getRecurring(client.id).then(setRecurring)
      db.getNotes(client.id).then(setNotes)
    })
  }, [client.id])

  const paidAmt = invoices.filter(i=>i.status==='betaald').reduce((s,i)=>s+Number(i.amount),0)
  const openAmt = invoices.filter(i=>['verzonden','te laat'].includes(i.status)).reduce((s,i)=>s+Number(i.amount),0)
  const mrr = db.calcMRR(recurring)

  const refreshInv = () => db.getInvoices(client.id).then(setInvoices)
  const refreshRec = () => db.getRecurring(client.id).then(setRecurring).then(() => db.getInvoices(client.id).then(setInvoices))
  const refreshNotes = () => db.getNotes(client.id).then(setNotes)

  async function delClient() {
    if (!confirm('Klant verwijderen?')) return
    await db.deleteClient(client.id); onRefresh(); showView('clients')
  }

  return (
    <div>
      <div className="topbar">
        <div className="bc"><span className="crumb" onClick={()=>showView('clients')}>Klanten</span><span className="sep">›</span><span className="bactive">{client.fname} {client.lname}</span></div>
        <div className="topbar-right"><ClientModal client={client} onSave={onRefresh} trigger={<button className="btn btn-ghost btn-sm">Bewerken</button>} /><button className="btn btn-danger btn-sm" onClick={delClient}>Verwijderen</button></div>
      </div>
      <div className="content">
        <div className="detail-grid">
          <div>
            <div className="sc">
              <div className="client-tabs">
                {[['projects','Projecten'],['tasks','Taken'],['invoices','Facturen'],['recurring','Terugkerend'],['notes','Notities']].map(([tab,label]) => (
                  <button key={tab} className={`client-tab${activeTab===tab?' active':''}`} onClick={()=>setActiveTab(tab)}>{label}</button>
                ))}
              </div>
              {activeTab==='projects' && (
                <div>
                  <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'flex-end'}}>
                    <ProjectModal clients={[client]} defaultClientId={client.id} onSave={onRefresh} trigger={<button className="btn btn-ghost btn-sm">+ Project</button>} />
                  </div>
                  <div className="sc-body">
                    {!clientProjects.length ? <div className="empty">Geen projecten</div> : clientProjects.map(p => {
                      const open=allTasks.filter(t=>t.project_id===p.id&&!t.done).length
                      return <div key={p.id} className="info-row" style={{cursor:'pointer',flexWrap:'wrap',gap:8}} onClick={()=>showView('project-detail',p.id)}>
                        <div style={{display:'flex',alignItems:'center',gap:9,flex:1}}><div style={{width:10,height:10,borderRadius:'50%',background:p.color,flexShrink:0}}></div><div><div style={{fontWeight:500,fontSize:13}}>{p.name}</div>{p.deadline&&<div style={{fontSize:11,color:'var(--text-faint)'}}>Deadline: {fdate(p.deadline)}</div>}</div></div>
                        <div style={{display:'flex',gap:5,flexShrink:0}}><Badge s={p.status} />{open>0&&<span className="badge bg-amber">{open} open</span>}</div>
                      </div>
                    })}
                  </div>
                </div>
              )}
              {activeTab==='tasks' && (
                <div className="sc-body">
                  {!clientTasks.length ? <div className="empty">Geen taken</div> : clientProjects.map(p => {
                    const ptasks=clientTasks.filter(t=>t.project_id===p.id); if(!ptasks.length) return null
                    return <div key={p.id} style={{marginBottom:18}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',padding:'0 0 8px',display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:8,height:8,borderRadius:'50%',background:p.color}}></div>
                        <span style={{cursor:'pointer'}} onClick={()=>showView('project-detail',p.id)}>{p.name}</span>
                        <span style={{color:'var(--text-faint)',fontWeight:400}}>{ptasks.filter(t=>!t.done).length} open</span>
                      </div>
                      {ptasks.map(t => <TaskItem key={t.id} task={t} onToggle={onRefresh} onDelete={onRefresh} />)}
                    </div>
                  })}
                </div>
              )}
              {activeTab==='invoices' && (
                <div>
                  <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'flex-end'}}><InvoiceModal clientId={client.id} onSave={refreshInv} trigger={<button className="btn btn-ghost btn-sm">+ Factuur</button>} /></div>
                  <div className="sc-body">
                    {!invoices.length ? <div className="empty">Geen facturen</div> : invoices.map(i => (
                      <div key={i.id} style={{display:'grid',gridTemplateColumns:'1fr auto auto 130px',gap:10,alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                        <div><div style={{fontSize:13,fontWeight:500}}>{i.description}{i.recurring_id&&<span style={{fontSize:10,color:'var(--teal-text)',background:'var(--teal-soft)',padding:'1px 6px',borderRadius:99,marginLeft:6}}>↻</span>}</div><div style={{fontSize:11,color:'var(--text-faint)'}}>{fdate(i.date)}</div></div>
                        <div style={{fontSize:11,color:'var(--text-faint)'}}>{i.due_date?'Vervalt '+fdate(i.due_date):''}</div>
                        <div style={{fontFamily:'DM Mono',fontSize:13,fontWeight:500,textAlign:'right'}}>{money(i.amount)}</div>
                        <div style={{display:'flex',alignItems:'center',gap:5,justifyContent:'flex-end'}}><Badge s={i.status} /><InvMenu onStatus={s=>db.updateInvoice(i.id,{status:s}).then(refreshInv)} onDelete={()=>db.deleteInvoice(i.id).then(refreshInv)} /></div>
                      </div>
                    ))}
                  </div>
                  <div className="total-bar"><span style={{color:'var(--text-muted)'}}>Betaald <strong>{money(paidAmt)}</strong></span><span>Nog te ontvangen <strong style={{color:'var(--amber-text)'}}>{money(openAmt)}</strong></span></div>
                </div>
              )}
              {activeTab==='recurring' && (
                <div>
                  <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:12,color:'var(--text-muted)'}}>Facturen worden automatisch aangemaakt</span>
                    <RecurringModal clientId={client.id} onSave={refreshRec} trigger={<button className="btn btn-ghost btn-sm">+ Toevoegen</button>} />
                  </div>
                  <div className="sc-body">
                    {!recurring.length ? <div className="empty">Geen terugkerende inkomsten</div> : recurring.map(r => {
                      const nd=db.nextDueDate(r); const dd=nd?daysN(nd):null
                      return <div key={r.id}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr auto auto 100px',gap:10,alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                          <div><div style={{fontSize:13,fontWeight:500}}>{r.description}</div><div style={{fontSize:11,color:'var(--text-faint)'}}>Gestart: {fdate(r.start_date)}{r.end_date?' · Eindigt: '+fdate(r.end_date):''}</div></div>
                          <Badge s={r.freq} />
                          <div style={{fontFamily:'DM Mono',fontSize:13,fontWeight:500,textAlign:'right'}}>{money(r.amount)}</div>
                          <div style={{display:'flex',alignItems:'center',gap:5,justifyContent:'flex-end'}}><Badge s={r.status} /><RecMenu onStatus={s=>db.updateRecurring(r.id,{status:s}).then(refreshRec)} onDelete={()=>db.deleteRecurring(r.id).then(refreshRec)} /></div>
                        </div>
                        {nd&&<div style={{fontSize:11,padding:'2px 0 6px',color:dd<=14?'var(--amber-text)':'var(--text-faint)',borderBottom:'1px solid var(--border)'}}>Volgende factuur: {fdate(nd)} ({dd===0?'vandaag':dd+'d'})</div>}
                      </div>
                    })}
                  </div>
                  <div className="total-bar"><span style={{color:'var(--text-muted)'}}>MRR <strong style={{color:'var(--teal-text)'}}>{money(mrr)}</strong></span><span>Jaarlijks <strong>{money(mrr*12)}</strong></span></div>
                </div>
              )}
              {activeTab==='notes' && (
                <div>
                  <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'flex-end'}}><NoteModal clientId={client.id} onSave={refreshNotes} trigger={<button className="btn btn-ghost btn-sm">+ Notitie</button>} /></div>
                  <div className="sc-body">
                    {!notes.length ? <div className="empty">Geen notities</div> : notes.map(n => (
                      <div key={n.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                        <div style={{fontSize:13,lineHeight:1.6}}>{n.content.split('\n').map((l,i)=><span key={i}>{l}<br/></span>)}</div>
                        <div style={{display:'flex',justifyContent:'space-between',marginTop:5}}><div style={{fontSize:11,color:'var(--text-faint)'}}>{fdate(n.created_at?.slice(0,10))}</div><button onClick={()=>db.deleteNote(n.id).then(refreshNotes)} style={{fontSize:11,color:'var(--text-faint)',cursor:'pointer'}}>Verwijderen</button></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="sc">
              <div className="sc-head"><span className="sc-title">Contactgegevens</span><ClientModal client={client} onSave={onRefresh} trigger={<button className="btn btn-ghost btn-sm">Bewerken</button>} /></div>
              <div className="sc-body">
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}><div className={`avatar ${avC(client.id)}`} style={{width:44,height:44,fontSize:15}}>{ini(client)}</div><div><div style={{fontWeight:600,fontSize:15}}>{client.fname} {client.lname}</div><div style={{fontSize:12,color:'var(--text-muted)'}}>{client.company||''}</div></div></div>
                <Badge s={client.status||'actief'} />
                <div style={{marginTop:12}}>
                  {client.email&&<div className="info-row"><span className="info-label">E-mail</span><a href={`mailto:${client.email}`} style={{color:'var(--blue-text)',fontSize:13}}>{client.email}</a></div>}
                  {client.phone&&<div className="info-row"><span className="info-label">Telefoon</span><span className="info-val">{client.phone}</span></div>}
                  {client.website&&<div className="info-row"><span className="info-label">Website</span><a href={client.website} target="_blank" rel="noreferrer" style={{color:'var(--blue-text)',fontSize:13}}>{client.website}</a></div>}
                </div>
              </div>
            </div>
            <div className="sc">
              <div className="sc-head"><span className="sc-title">Snel overzicht</span></div>
              <div className="sc-body">
                <div className="info-row"><span className="info-label">Omzet betaald</span><span className="info-val" style={{fontFamily:'DM Mono',fontWeight:500}}>{money(paidAmt)}</span></div>
                <div className="info-row"><span className="info-label">Nog te ontvangen</span><span className="info-val" style={{fontFamily:'DM Mono',color:'var(--amber-text)'}}>{openAmt>0?money(openAmt):'—'}</span></div>
                <div className="info-row"><span className="info-label">MRR</span><span className="info-val" style={{fontFamily:'DM Mono',color:'var(--teal-text)'}}>{mrr>0?money(mrr)+'/mnd':'—'}</span></div>
                <div className="info-row"><span className="info-label">Projecten</span><span className="info-val">{clientProjects.length}</span></div>
                <div className="info-row"><span className="info-label">Open taken</span><span className="info-val">{clientTasks.filter(t=>!t.done).length}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProjectsView({ projects, clients, clientName, showView, onRefresh }) {
  const [q, setQ] = useState('')
  const filtered = projects.filter(p => !q||p.name.toLowerCase().includes(q.toLowerCase())||clientName(p.client_id).toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <div className="topbar"><h2>Projecten</h2><div className="topbar-right"><div className="search-wrap"><span className="search-icon">⌕</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Zoeken…" /></div><ProjectModal clients={clients} onSave={onRefresh} trigger={<button className="btn btn-primary btn-sm">+ Nieuw project</button>} /></div></div>
      <div className="content">
        <div className="sc" style={{padding:0}}>
          <div className="pl-header"><div>Project</div><div>Klant</div><div>Deadline</div><div>Status</div><div>Info</div></div>
          {!filtered.length ? <div className="empty">Geen projecten</div> : filtered.map(p => {
            const dd=p.deadline?daysN(p.deadline):null; const dC=dd!=null?(dd<0?'var(--red-text)':dd<=7?'var(--amber-text)':'var(--text-muted)'):'var(--text-muted)'
            return <div key={p.id} className="pl-row" onClick={()=>showView('project-detail',p.id)}>
              <div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:10,height:10,borderRadius:'50%',background:p.color,flexShrink:0}}></div><div><div style={{fontWeight:500,fontSize:14}}>{p.name}</div>{p.url&&<div style={{fontSize:11,color:'var(--blue-text)'}}>{p.url.replace('https://','').replace('http://','')}</div>}</div></div>
              <div style={{fontSize:13,color:'var(--text-muted)'}}>{clientName(p.client_id)||'—'}</div>
              <div style={{fontSize:13,color:dC}}>{p.deadline?fdate(p.deadline):'—'}</div>
              <div><Badge s={p.status} /></div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                {p.url&&<a href={p.url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="btn btn-ghost btn-xs" style={{textDecoration:'none'}}>↗ Open</a>}
              </div>
            </div>
          })}
        </div>
      </div>
    </div>
  )
}

function ProjectDetailView({ project, clients, clientName, showView, onRefresh }) {
  const [tasks, setTasks] = useState([])
  useEffect(() => { db.getTasks(project.id).then(setTasks) }, [project.id])
  const refreshTasks = () => db.getTasks(project.id).then(setTasks)
  const open=tasks.filter(t=>!t.done), done=tasks.filter(t=>t.done)
  const pct=tasks.length?Math.round(done.length/tasks.length*100):0
  const cn=clientName(project.client_id)

  async function delProject() {
    if(!confirm('Project verwijderen?')) return
    await db.deleteProject(project.id); onRefresh(); showView('projects')
  }

  return (
    <div>
      <div className="topbar">
        <div className="bc"><span className="crumb" onClick={()=>showView('projects')}>Projecten</span><span className="sep">›</span><span className="bactive">{project.name}</span></div>
        <div className="topbar-right"><ProjectModal project={project} clients={clients} onSave={onRefresh} trigger={<button className="btn btn-ghost btn-sm">Bewerken</button>} /><button className="btn btn-danger btn-sm" onClick={delProject}>Verwijderen</button></div>
      </div>
      <div className="content">
        <div className="detail-grid">
          <div>
            <div className="sc">
              <div className="sc-head"><span className="sc-title">Taken</span><TaskModal projectId={project.id} onSave={refreshTasks} trigger={<button className="btn btn-ghost btn-sm">+ Taak</button>} /></div>
              <div className="sc-body">
                {!tasks.length ? <div className="empty">Nog geen taken</div> : <>
                  {open.map(t=><TaskItem key={t.id} task={t} onToggle={refreshTasks} onDelete={refreshTasks} />)}
                  {done.length>0&&<div style={{padding:'10px 0 4px',fontSize:11,fontWeight:600,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.05em'}}>Afgerond ({done.length})</div>}
                  {done.map(t=><TaskItem key={t.id} task={t} onToggle={refreshTasks} onDelete={refreshTasks} />)}
                </>}
              </div>
              <QuickTaskAdd projectId={project.id} onAdd={refreshTasks} />
            </div>
          </div>
          <div>
            <div className="sc">
              <div className="sc-head"><span className="sc-title">Projectinfo</span></div>
              <div className="sc-body">
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}><div style={{width:13,height:13,borderRadius:'50%',background:project.color}}></div><div style={{fontWeight:600,fontSize:15}}>{project.name}</div></div>
                <Badge s={project.status} />
                <div style={{marginTop:12}}>
                  {cn&&<div className="info-row"><span className="info-label">Klant</span><span className="info-val" style={{cursor:'pointer',color:'var(--blue-text)'}} onClick={()=>showView('client-detail',project.client_id)}>{cn}</span></div>}
                  {project.url&&<div className="info-row"><span className="info-label">URL</span><div style={{display:'flex',alignItems:'center',gap:8,flex:1}}><a href={project.url} target="_blank" rel="noreferrer" style={{color:'var(--blue-text)',fontSize:13,flex:1}}>{project.url}</a><a href={project.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-xs" style={{textDecoration:'none',flexShrink:0}}>↗ Open site</a></div></div>}
                  {project.start_date&&<div className="info-row"><span className="info-label">Startdatum</span><span className="info-val">{fdate(project.start_date)}</span></div>}
                  {project.deadline&&<div className="info-row"><span className="info-label">Deadline</span><span className="info-val">{fdate(project.deadline)}</span></div>}
                </div>
              </div>
            </div>
            <div className="sc">
              <div className="sc-head"><span className="sc-title">Voortgang</span></div>
              <div className="sc-body">
                <div className="info-row"><span className="info-label">Open</span><span className="info-val">{open.length}</span></div>
                <div className="info-row"><span className="info-label">Afgerond</span><span className="info-val">{done.length}</span></div>
                <div className="info-row"><span className="info-label">Voortgang</span><span className="info-val"><div style={{display:'flex',alignItems:'center',gap:8}}><div style={{flex:1,height:5,background:'var(--border)',borderRadius:99}}><div style={{height:'100%',width:pct+'%',background:project.color,borderRadius:99}}></div></div><span style={{fontSize:12,color:'var(--text-muted)'}}>{pct}%</span></div></span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TasksView({ allTasks, showView }) {
  const [filter, setFilter] = useState('open')
  const filtered = allTasks.filter(t => filter==='all'?true:filter==='done'?t.done:!t.done)
  return (
    <div>
      <div className="topbar"><h2>Alle taken</h2><div className="topbar-right"><div className="tabs"><button className={`tab${filter==='open'?' active':''}`} onClick={()=>setFilter('open')}>Open</button><button className={`tab${filter==='done'?' active':''}`} onClick={()=>setFilter('done')}>Afgerond</button><button className={`tab${filter==='all'?' active':''}`} onClick={()=>setFilter('all')}>Alles</button></div></div></div>
      <div className="content">
        <div className="sc"><div className="sc-body">
          {!filtered.length ? <div className="empty">Geen taken</div> : filtered.map(t => (
            <div key={t.id} className="task-item">
              <div className={`task-check${t.done?' done':''}`} style={{display:'flex',alignItems:'center',justifyContent:'center'}}>{t.done&&<span style={{color:'#fff',fontSize:10}}>✓</span>}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,textDecoration:t.done?'line-through':'none',color:t.done?'var(--text-faint)':'var(--text)'}}>{t.description}</div>
                <div className="task-meta" style={{cursor:'pointer'}} onClick={()=>showView('project-detail',t.project_id)}>
                  {t.project&&<span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'1px 7px',borderRadius:99,fontSize:11,fontWeight:500,background:t.project.color+'18',color:t.project.color}}>{t.project.name}</span>}
                  {t.due_date&&' · '+fdate(t.due_date)}
                </div>
              </div>
            </div>
          ))}
        </div></div>
      </div>
    </div>
  )
}

function FinanceView({ allInvoices, allRecurring, totalPaid, totalOpen, totalMRR }) {
  const lateAmt = allInvoices.filter(i=>i.status==='te laat').reduce((s,i)=>s+Number(i.amount),0)
  const byFreq = { maandelijks:0, kwartaallijks:0, jaarlijks:0 }
  allRecurring.filter(r=>r.status==='actief').forEach(r=>{ byFreq[r.freq]=(byFreq[r.freq]||0)+Number(r.amount) })
  const sorted = [...allInvoices].sort((a,b)=>(b.date||'').localeCompare(a.date||''))
  return (
    <div>
      <div className="topbar"><h2>Financiën</h2></div>
      <div className="content">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Totaal betaald</div><div className="stat-value" style={{fontSize:18}}>{money(totalPaid)}</div></div>
          <div className="stat-card"><div className="stat-label">Nog te ontvangen</div><div className="stat-value" style={{fontSize:18,color:'var(--amber-text)'}}>{money(totalOpen)}</div>{lateAmt>0&&<div className="stat-sub" style={{color:'var(--red-text)'}}>{money(lateAmt)} te laat</div>}</div>
          <div className="stat-card"><div className="stat-label">MRR</div><div className="stat-value" style={{fontSize:18,color:'var(--teal-text)'}}>{money(totalMRR)}</div><div className="stat-sub">ARR: {money(totalMRR*12)}</div></div>
          <div className="stat-card"><div className="stat-label">Facturen</div><div className="stat-value">{allInvoices.length}</div></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16}}>
          <div className="sc" style={{padding:0}}>
            <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr 1fr 110px',padding:'8px 18px',background:'var(--bg)',borderBottom:'1px solid var(--border)',fontSize:10,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em'}}><div>Klant / omschrijving</div><div>Datum</div><div>Vervaldatum</div><div style={{textAlign:'right'}}>Bedrag</div><div style={{textAlign:'right'}}>Status</div></div>
            {!sorted.length ? <div className="empty">Geen facturen</div> : sorted.map(i => (
              <div key={i.id} style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr 1fr 110px',gap:10,alignItems:'center',padding:'11px 18px',borderBottom:'1px solid var(--border)',fontSize:13}}>
                <div><div style={{fontWeight:500}}>{i.description}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{i.clients?.fname} {i.clients?.lname}{i.clients?.company?' · '+i.clients.company:''}</div></div>
                <div style={{color:'var(--text-muted)'}}>{fdate(i.date)}</div>
                <div style={{color:'var(--text-muted)'}}>{fdate(i.due_date)}</div>
                <div style={{fontFamily:'DM Mono',textAlign:'right'}}>{money(i.amount)}</div>
                <div style={{textAlign:'right'}}><Badge s={i.status} /></div>
              </div>
            ))}
          </div>
          <div className="sc">
            <div className="sc-head"><span className="sc-title">Terugkerend</span></div>
            <div className="sc-body">
              <div className="info-row"><span className="info-label">Maandelijks</span><span className="info-val" style={{fontFamily:'DM Mono'}}>{money(byFreq.maandelijks)}</span></div>
              <div className="info-row"><span className="info-label">Kwartaal</span><span className="info-val" style={{fontFamily:'DM Mono'}}>{money(byFreq.kwartaallijks)}</span></div>
              <div className="info-row"><span className="info-label">Jaarlijks</span><span className="info-val" style={{fontFamily:'DM Mono'}}>{money(byFreq.jaarlijks)}</span></div>
              <div style={{borderTop:'1px solid var(--border)',marginTop:8,paddingTop:8}}>
                <div className="info-row"><span className="info-label">MRR totaal</span><span className="info-val" style={{fontFamily:'DM Mono',color:'var(--teal-text)',fontWeight:500}}>{money(totalMRR)}</span></div>
                <div className="info-row"><span className="info-label">ARR totaal</span><span className="info-val" style={{fontFamily:'DM Mono',fontWeight:500}}>{money(totalMRR*12)}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TaskItem({ task, onToggle, onDelete }) {
  async function toggle() { await db.updateTask(task.id, { done: !task.done }); onToggle() }
  async function del() { await db.deleteTask(task.id); onDelete() }
  return (
    <div className="task-item">
      <div className={`task-check${task.done?' done':''}`} onClick={toggle} style={{display:'flex',alignItems:'center',justifyContent:'center'}}>{task.done&&<span style={{color:'#fff',fontSize:10}}>✓</span>}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:13,textDecoration:task.done?'line-through':'none',color:task.done?'var(--text-faint)':'var(--text)'}}>{task.description}</div>
        {task.due_date&&<div className="task-meta">{fdate(task.due_date)}</div>}
      </div>
      <span className="task-del" onClick={del}>×</span>
    </div>
  )
}

function QuickTaskAdd({ projectId, onAdd }) {
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState('')
  async function add() {
    if (!desc.trim()) return
    await db.createTask({ project_id: projectId, description: desc.trim(), due_date: date||null, priority: 'normaal', done: false })
    setDesc(''); setDate(''); onAdd()
  }
  return (
    <div className="quick-add">
      <input type="text" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Snel taak toevoegen…" onKeyDown={e=>e.key==='Enter'&&add()} />
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
      <button className="btn btn-ghost btn-sm" onClick={add}>Voeg toe</button>
    </div>
  )
}

function InvMenu({ onStatus, onDelete }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{position:'relative',display:'inline-block'}}>
      <button className="btn btn-ghost btn-xs" onClick={()=>setOpen(!open)}>⋯</button>
      {open&&<div style={{position:'absolute',right:0,top:'calc(100% + 4px)',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--rsm)',boxShadow:'0 4px 16px rgba(0,0,0,.08)',zIndex:50,minWidth:140,padding:4}} onMouseLeave={()=>setOpen(false)}>
        {['betaald','verzonden','te laat'].map(s=><button key={s} style={{display:'block',width:'100%',textAlign:'left',padding:'7px 10px',fontSize:13,borderRadius:4}} onClick={()=>{onStatus(s);setOpen(false)}}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>)}
        <hr style={{border:'none',borderTop:'1px solid var(--border)',margin:'4px 0'}} />
        <button style={{display:'block',width:'100%',textAlign:'left',padding:'7px 10px',fontSize:13,color:'var(--red-text)',borderRadius:4}} onClick={()=>{onDelete();setOpen(false)}}>Verwijderen</button>
      </div>}
    </div>
  )
}

function RecMenu({ onStatus, onDelete }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{position:'relative',display:'inline-block'}}>
      <button className="btn btn-ghost btn-xs" onClick={()=>setOpen(!open)}>⋯</button>
      {open&&<div style={{position:'absolute',right:0,top:'calc(100% + 4px)',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--rsm)',boxShadow:'0 4px 16px rgba(0,0,0,.08)',zIndex:50,minWidth:140,padding:4}} onMouseLeave={()=>setOpen(false)}>
        {['actief','gepauzeerd','gestopt'].map(s=><button key={s} style={{display:'block',width:'100%',textAlign:'left',padding:'7px 10px',fontSize:13,borderRadius:4}} onClick={()=>{onStatus(s);setOpen(false)}}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>)}
        <hr style={{border:'none',borderTop:'1px solid var(--border)',margin:'4px 0'}} />
        <button style={{display:'block',width:'100%',textAlign:'left',padding:'7px 10px',fontSize:13,color:'var(--red-text)',borderRadius:4}} onClick={()=>{onDelete();setOpen(false)}}>Verwijderen</button>
      </div>}
    </div>
  )
}

function ClientModal({ client, onSave, trigger }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const init = { fname:'', lname:'', company:'', email:'', phone:'', website:'', status:'actief' }
  const [form, setForm] = useState(init)
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}))
  function openModal() { setForm(client?{fname:client.fname||'',lname:client.lname||'',company:client.company||'',email:client.email||'',phone:client.phone||'',website:client.website||'',status:client.status||'actief'}:init); setOpen(true) }
  async function save() {
    if(!form.fname&&!form.lname) return alert('Vul een naam in.')
    setSaving(true)
    try {
      if(client) await db.updateClient(client.id, form)
      else await db.createClient(form)
      setOpen(false); onSave()
    } catch(e) {
      alert('Fout bij opslaan: ' + e.message)
    } finally {
      setSaving(false)
    }
  }
  return <>
    {React.cloneElement(trigger,{onClick:openModal})}
    <Modal open={open} onClose={()=>setOpen(false)} title={client?'Klant bewerken':'Nieuwe klant'}>
      <FR><FG label="Voornaam"><input value={form.fname} onChange={f('fname')} autoFocus /></FG><FG label="Achternaam"><input value={form.lname} onChange={f('lname')} /></FG></FR>
      <FG label="Bedrijfsnaam"><input value={form.company} onChange={f('company')} /></FG>
      <FR><FG label="E-mail"><input type="email" value={form.email} onChange={f('email')} /></FG><FG label="Telefoon"><input type="tel" value={form.phone} onChange={f('phone')} /></FG></FR>
      <FG label="Website"><input type="url" value={form.website} onChange={f('website')} placeholder="https://" /></FG>
      <FG label="Status"><select value={form.status} onChange={f('status')}><option value="actief">Actief</option><option value="prospect">Prospect</option><option value="inactief">Inactief</option></select></FG>
      <ModalActions onCancel={()=>setOpen(false)} onSave={save} saving={saving} />
    </Modal>
  </>
}

function ProjectModal({ project, clients, defaultClientId, onSave, trigger }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [color, setColor] = useState(PROJ_COLORS[0])
  const init = { name:'', client_id:'', url:'', start_date:'', deadline:'', status:'actief' }
  const [form, setForm] = useState(init)
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}))
  function openModal() { setForm(project?{name:project.name||'',client_id:project.client_id||'',url:project.url||'',start_date:project.start_date||'',deadline:project.deadline||'',status:project.status||'actief'}:{...init,client_id:defaultClientId||''}); setColor(project?.color||PROJ_COLORS[0]); setOpen(true) }
  async function save() {
    if(!form.name.trim()) return alert('Vul een projectnaam in.')
    setSaving(true)
    try {
      const data={
        name: form.name.trim(),
        client_id: form.client_id || null,
        url: form.url || null,
        start_date: form.start_date || null,
        deadline: form.deadline || null,
        status: form.status,
        color
      }
      if(project) await db.updateProject(project.id, data)
      else await db.createProject(data)
      setOpen(false)
      onSave()
    } catch(e) {
      alert('Fout bij opslaan: ' + e.message)
    } finally {
      setSaving(false)
    }
  }
  return <>
    {React.cloneElement(trigger,{onClick:openModal})}
    <Modal open={open} onClose={()=>setOpen(false)} title={project?'Project bewerken':'Nieuw project'}>
      <FG label="Projectnaam"><input value={form.name} onChange={f('name')} autoFocus /></FG>
      <FG label="Klant (optioneel)"><select value={form.client_id} onChange={f('client_id')}><option value="">— Geen klant —</option>{(clients||[]).map(c=><option key={c.id} value={c.id}>{c.fname} {c.lname}{c.company?' ('+c.company+')':''}</option>)}</select></FG>
      <FG label="URL"><input type="url" value={form.url} onChange={f('url')} placeholder="https://" /></FG>
      <FR><FG label="Startdatum"><input type="date" value={form.start_date} onChange={f('start_date')} /></FG><FG label="Deadline"><input type="date" value={form.deadline} onChange={f('deadline')} /></FG></FR>
      <FG label="Status"><select value={form.status} onChange={f('status')}><option value="actief">Actief</option><option value="on-hold">On-hold</option><option value="afgerond">Afgerond</option></select></FG>
      <FG label="Kleur"><div className="color-opts">{PROJ_COLORS.map(c=><div key={c} className={`color-opt${color===c?' sel':''}`} style={{background:c}} onClick={()=>setColor(c)} />)}</div></FG>
      <ModalActions onCancel={()=>setOpen(false)} onSave={save} saving={saving} />
    </Modal>
  </>
}

function TaskModal({ projectId, onSave, trigger }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ description:'', due_date:'', priority:'normaal' })
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}))
  async function save() {
    if(!form.description.trim()) return
    setSaving(true)
    try {
      await db.createTask({ project_id: projectId, description: form.description.trim(), due_date: form.due_date||null, priority: form.priority, done: false })
      setOpen(false); onSave()
    } catch(e) {
      alert('Fout bij opslaan: ' + e.message)
    } finally {
      setSaving(false)
    }
  }
  return <>
    {React.cloneElement(trigger,{onClick:()=>{setForm({description:'',due_date:'',priority:'normaal'});setOpen(true)}})}
    <Modal open={open} onClose={()=>setOpen(false)} title="Nieuwe taak">
      <FG label="Omschrijving"><textarea value={form.description} onChange={f('description')} autoFocus /></FG>
      <FR><FG label="Deadline"><input type="date" value={form.due_date} onChange={f('due_date')} /></FG><FG label="Prioriteit"><select value={form.priority} onChange={f('priority')}><option value="normaal">Normaal</option><option value="hoog">Hoog</option><option value="laag">Laag</option></select></FG></FR>
      <ModalActions onCancel={()=>setOpen(false)} onSave={save} saving={saving} />
    </Modal>
  </>
}

function InvoiceModal({ clientId, onSave, trigger }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ description:'', amount:'', date:today(), due_date:'', status:'concept' })
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}))
  async function save() {
    if(!form.description.trim()||!form.amount) return
    setSaving(true)
    try {
      await db.createInvoice({ client_id: clientId, description: form.description, amount: parseFloat(form.amount), date: form.date, due_date: form.due_date||null, status: form.status })
      setOpen(false); onSave()
    } catch(e) {
      alert('Fout bij opslaan: ' + e.message)
    } finally {
      setSaving(false)
    }
  }
  return <>
    {React.cloneElement(trigger,{onClick:()=>{setForm({description:'',amount:'',date:today(),due_date:'',status:'concept'});setOpen(true)}})}
    <Modal open={open} onClose={()=>setOpen(false)} title="Nieuwe factuur">
      <FG label="Omschrijving"><input value={form.description} onChange={f('description')} autoFocus /></FG>
      <FR><FG label="Bedrag (€)"><input type="number" value={form.amount} onChange={f('amount')} step="0.01" min="0" /></FG><FG label="Factuurdatum"><input type="date" value={form.date} onChange={f('date')} /></FG></FR>
      <FR><FG label="Vervaldatum"><input type="date" value={form.due_date} onChange={f('due_date')} /></FG><FG label="Status"><select value={form.status} onChange={f('status')}><option value="concept">Concept</option><option value="verzonden">Verzonden</option><option value="betaald">Betaald</option><option value="te laat">Te laat</option></select></FG></FR>
      <ModalActions onCancel={()=>setOpen(false)} onSave={save} saving={saving} />
    </Modal>
  </>
}

function RecurringModal({ clientId, onSave, trigger }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ description:'', amount:'', freq:'maandelijks', start_date:today(), end_date:'', status:'actief' })
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}))
  async function save() {
    if(!form.description.trim()||!form.amount) return alert('Vul omschrijving en bedrag in.')
    setSaving(true)
    try {
      await db.createRecurring({ client_id: clientId, description: form.description, amount: parseFloat(form.amount), freq: form.freq, start_date: form.start_date||today(), end_date: form.end_date||null, status: form.status })
      setOpen(false); onSave()
    } catch(e) {
      alert('Fout bij opslaan: ' + e.message)
    } finally {
      setSaving(false)
    }
  }
  return <>
    {React.cloneElement(trigger,{onClick:()=>{setForm({description:'',amount:'',freq:'maandelijks',start_date:today(),end_date:'',status:'actief'});setOpen(true)}})}
    <Modal open={open} onClose={()=>setOpen(false)} title="Terugkerende inkomst toevoegen">
      <FG label="Omschrijving"><input value={form.description} onChange={f('description')} placeholder="Bijv. Onderhoud, Hosting, SEO pakket…" autoFocus /></FG>
      <FR><FG label="Bedrag (€)"><input type="number" value={form.amount} onChange={f('amount')} step="0.01" min="0" /></FG><FG label="Frequentie"><select value={form.freq} onChange={f('freq')}><option value="maandelijks">Maandelijks</option><option value="kwartaallijks">Kwartaallijks</option><option value="jaarlijks">Jaarlijks</option></select></FG></FR>
      <FR><FG label="Startdatum"><input type="date" value={form.start_date} onChange={f('start_date')} /></FG><FG label="Einddatum (opt.)"><input type="date" value={form.end_date} onChange={f('end_date')} /></FG></FR>
      <div style={{background:'var(--blue-soft)',borderRadius:'var(--rsm)',padding:'10px 12px',fontSize:12,color:'var(--blue-text)',marginBottom:4}}>Bij opslaan worden direct facturen aangemaakt voor alle verlengingen tot vandaag.</div>
      <ModalActions onCancel={()=>setOpen(false)} onSave={save} saving={saving} />
    </Modal>
  </>
}

function NoteModal({ clientId, onSave, trigger }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [content, setContent] = useState('')
  async function save() {
    if(!content.trim()) return
    setSaving(true)
    await db.createNote({ client_id: clientId, content: content.trim() })
    setSaving(false); setOpen(false); onSave()
  }
  return <>
    {React.cloneElement(trigger,{onClick:()=>{setContent('');setOpen(true)}})}
    <Modal open={open} onClose={()=>setOpen(false)} title="Nieuwe notitie">
      <FG label="Notitie"><textarea value={content} onChange={e=>setContent(e.target.value)} rows={5} autoFocus /></FG>
      <ModalActions onCancel={()=>setOpen(false)} onSave={save} saving={saving} />
    </Modal>
  </>
}
