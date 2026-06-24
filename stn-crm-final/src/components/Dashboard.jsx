import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import * as db from '../lib/db'
import ProfileView from './ProfileView.jsx'
import PipelineView from './PipelineView.jsx'

export const money = n => '€\u202f' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fdate = d => { if (!d) return '—'; return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) }
export const today = () => new Date().toISOString().slice(0, 10)
export const daysN = d => { if (!d) return null; return Math.ceil((new Date(d) - new Date(today())) / 86400000) }
const AVC = ['av-b','av-g','av-p','av-a','av-r','av-t']
const avC = id => { const n = parseInt(String(id).replace(/-/g,'').slice(0,8), 16); return AVC[n % AVC.length] }
const ini = c => ((c.fname||'?')[0] + (c.lname||'?')[0]).toUpperCase()
const PROJ_COLORS = ['#2563eb','#7c3aed','#0d9488','#d97706','#dc2626','#16a34a','#db2777','#1a1a18']
const FREQ_MONTHS = { maandelijks: 1, kwartaallijks: 3, jaarlijks: 12 }

let _toastFn = null
export function showToast(msg, type = 'success') { if (_toastFn) _toastFn(msg, type) }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  useEffect(() => {
    _toastFn = (msg, type) => {
      const id = Date.now()
      setToasts(t => [...t, { id, msg, type }])
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
    }
    return () => { _toastFn = null }
  }, [])
  return (
    <>
      {children}
      <div style={{position:'fixed',bottom:24,right:24,zIndex:999,display:'flex',flexDirection:'column',gap:8,alignItems:'flex-end'}}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === 'error' ? 'var(--red-text)' : 'var(--text)',
            color:'#fff', padding:'10px 16px', borderRadius:'var(--rsm)',
            fontSize:13, fontWeight:500, boxShadow:'0 4px 16px rgba(0,0,0,.18)',
            animation:'toast-in .2s cubic-bezier(.16,1,.3,1)',
            maxWidth:320, lineHeight:1.4
          }}>{t.msg}</div>
        ))}
      </div>
      <style>{`@keyframes toast-in{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </>
  )
}

export function Badge({ s }) {
  const m = { actief:'bg-green',prospect:'bg-blue',inactief:'bg-gray',betaald:'bg-green',verzonden:'bg-blue','te laat':'bg-red',concept:'bg-gray','on-hold':'bg-amber',afgerond:'bg-green',hoog:'bg-red',laag:'bg-gray',normaal:'bg-blue',gepauzeerd:'bg-amber',gestopt:'bg-gray',maandelijks:'bg-teal',kwartaallijks:'bg-purple',jaarlijks:'bg-blue' }
  return <span className={`badge ${m[s]||'bg-gray'}`}>{s}</span>
}

export function MeetingTypeIcon({ type, size = 14 }) {
  const p = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2, strokeLinecap:'round', strokeLinejoin:'round' }
  if (type === 'videocall') return <svg {...p}><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>
  if (type === 'bel') return <svg {...p}><path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/></svg>
  if (type === 'locatie') return <svg {...p}><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
  return <svg {...p}><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
}

export function buildMeetingCalendarUrl(m, client) {
  const base = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
  const title = encodeURIComponent(m.title + ' — ' + client.fname + ' ' + client.lname)
  const date = m.meeting_date.replace(/-/g, '')
  let dates = ''
  if (m.meeting_time) {
    const [h, min] = m.meeting_time.split(':')
    const start = date + 'T' + h.padStart(2,'0') + min.padStart(2,'0') + '00'
    const endMin = parseInt(min) + (m.duration_minutes % 60)
    const endH = parseInt(h) + Math.floor(m.duration_minutes / 60) + Math.floor(endMin / 60)
    const end = date + 'T' + String(endH).padStart(2,'0') + String(endMin % 60).padStart(2,'0') + '00'
    dates = `&dates=${start}/${end}`
  } else {
    dates = `&dates=${date}/${date}`
  }
  const details = encodeURIComponent([
    m.notes || '',
    m.location ? 'Locatie: ' + m.location : '',
    'Klant: ' + client.fname + ' ' + client.lname,
    client.email ? 'Email: ' + client.email : '',
    client.phone ? 'Tel: ' + client.phone : ''
  ].filter(Boolean).join('\n'))
  const location = m.location ? '&location=' + encodeURIComponent(m.location) : ''
  return `${base}&text=${title}${dates}&details=${details}${location}`
}

export function EyeIcon({ off, size = 13 }) {
  const p = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:2, strokeLinecap:'round', strokeLinejoin:'round' }
  if (off) return <svg {...p}><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>
  return <svg {...p}><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>
}

function MaskedSecret({ value }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
      <strong style={{fontFamily:'var(--mono-font)',fontSize:12}}>{show ? value : '••••••••'}</strong>
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
        style={{color:'var(--text-faint)',display:'inline-flex',alignItems:'center',padding:2}}
      ><EyeIcon off={show} /></button>
    </span>
  )
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
  const [profile, setProfile] = useState(null)
  const [darkMode, setDarkMode] = useState(() => { try { return localStorage.getItem('stn_theme') === 'dark' } catch(e) { return false } })
  const [curClientId, setCurClientId] = useState(null)
  const [curProjectId, setCurProjectId] = useState(null)
  const [clients, setClients] = useState([])
  const [projects, setProjects] = useState([])
  const [allTasks, setAllTasks] = useState([])
  const [allInvoices, setAllInvoices] = useState([])
  const [allRecurring, setAllRecurring] = useState([])
  const [allHosting, setAllHosting] = useState([])
  const [allMeetings, setAllMeetings] = useState([])
  const [pipeline, setPipeline] = useState([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function applyProfileTheme(p) {
    if (p.theme) setDarkMode(p.theme === 'dark')
    if (p.accent_color) {
      document.documentElement.style.setProperty('--accent', p.accent_color)
      document.documentElement.style.setProperty('--accent-hover', p.accent_color + 'dd')
      document.documentElement.style.setProperty('--accent-soft', p.accent_color + '18')
      document.documentElement.style.setProperty('--accent-text', p.accent_color)
      document.documentElement.style.setProperty('--green', p.accent_color)
      document.documentElement.style.setProperty('--green-soft', p.accent_color + '18')
      document.documentElement.style.setProperty('--green-text', p.accent_color)
    }
  }

  const loadAll = useCallback(async () => {
    try {
      const [c, p, i, r, t, h, m, pl] = await Promise.all([
        db.getClients(), db.getProjects(), db.getAllInvoices(), db.getAllRecurring(), db.getAllTasks(), db.getAllHosting(), db.getAllMeetings(), db.getPipeline()
      ])
      setClients(c); setProjects(p); setAllInvoices(i); setAllRecurring(r); setAllHosting(h); setAllMeetings(m); setPipeline(pl)
      setAllTasks(t.map(task => ({ ...task, project: task.projects })))
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { db.getProfile(session.user.id).then(p => { if(p) { setProfile(p); applyProfileTheme(p) } }) }, [session.user.id])
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    try { localStorage.setItem('stn_theme', darkMode ? 'dark' : 'light') } catch(e) {}
  }, [darkMode])

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
    .app{display:flex;min-height:100vh;transition:background .2s}
    .sidebar{width:224px;min-width:224px;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;height:100vh;z-index:20;overflow-y:auto;transition:background .2s,border .2s}
    .main{margin-left:224px;flex:1;min-height:100vh}
    .sb-logo{padding:20px 18px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
    .sb-logo-icon{width:32px;height:32px;border-radius:8px;background:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(61,182,142,0.3)}
    .sb-logo-icon span{color:#fff;font-size:15px;font-family:var(--heading-font);font-weight:700}
    .sb-logo-text h1{font-size:14px;font-weight:700;letter-spacing:-.02em;font-family:var(--heading-font)}
    .sb-logo-text span{font-size:10px;color:var(--text-faint);font-weight:400}
    .sb-nav{flex:1;padding:12px 10px}
    .nav-section{font-size:10px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:.08em;padding:14px 8px 5px}
    .nav-item{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:var(--rsm);color:var(--text-muted);font-size:13px;font-weight:500;cursor:pointer;margin-bottom:2px;width:100%;text-align:left;transition:all .12s;border:none;background:none}
    .nav-item:hover{background:var(--accent-soft);color:var(--accent-text)}
    .nav-item.active{background:var(--accent-soft);color:var(--accent-text);font-weight:600}
    .nav-item.active .nav-dot{background:var(--accent)}
    .nav-dot{width:6px;height:6px;border-radius:50%;background:var(--border-strong);flex-shrink:0;transition:background .12s}
    .sb-footer{padding:14px 16px;border-top:1px solid var(--border)}
    .topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:0 26px;height:56px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;transition:background .2s,border .2s}
    .topbar h2{font-size:16px;font-weight:700;letter-spacing:-.02em;font-family:var(--heading-font)}
    .topbar-right{display:flex;align-items:center;gap:8px}
    .bc{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--text-muted)}
    .bc .crumb{cursor:pointer;transition:color .1s}.bc .crumb:hover{color:var(--text)}
    .bc .sep{color:var(--text-faint);font-size:11px}
    .bc .bactive{color:var(--text);font-weight:600;font-family:var(--heading-font)}
    .btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--rsm);font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;border:1px solid transparent;line-height:1;white-space:nowrap}
    .btn-primary{background:var(--accent);color:#fff;box-shadow:0 2px 6px rgba(61,182,142,0.25)}.btn-primary:hover{background:var(--accent-hover);box-shadow:0 3px 10px rgba(61,182,142,0.35)}.btn-primary:disabled{opacity:.5;cursor:not-allowed}
    .btn-ghost{background:none;border-color:var(--border-strong);color:var(--text-muted)}.btn-ghost:hover{background:var(--accent-soft);color:var(--accent-text);border-color:var(--accent)}
    .btn-danger{background:var(--red-soft);color:var(--red-text);border-color:transparent}.btn-danger:hover{opacity:.85}
    .btn-sm{padding:5px 11px;font-size:12px}.btn-xs{padding:3px 8px;font-size:11px}
    .content{padding:26px}
    .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
    .stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:18px 20px;transition:background .2s,border .2s;box-shadow:var(--shadow)}
    .stat-card:hover{border-color:var(--accent);box-shadow:0 0 0 3px rgba(61,182,142,0.08)}
    .stat-label{font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px}
    .stat-value{font-size:22px;font-weight:700;letter-spacing:-.03em;font-family:var(--heading-font)}
    .stat-sub{font-size:11px;color:var(--text-faint);margin-top:3px}
    .sc{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:16px;overflow:hidden;box-shadow:var(--shadow);transition:background .2s,border .2s}
    .sc-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)}
    .sc-title{font-size:13px;font-weight:600;font-family:var(--heading-font);display:flex;align-items:center;gap:8px}
    .sc-body{padding:16px 18px}
    .cl-header{display:grid;grid-template-columns:2fr 1.4fr 0.9fr 1.1fr 80px;padding:9px 20px;background:var(--bg2);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em}
    .cl-row{display:grid;grid-template-columns:2fr 1.4fr 0.9fr 1.1fr 80px;padding:13px 20px;border-bottom:1px solid var(--border);align-items:center;cursor:pointer;transition:background .1s}
    .cl-row:last-child{border-bottom:none}.cl-row:hover{background:var(--accent-soft)}
    .pl-header{display:grid;grid-template-columns:2fr 1.4fr 1fr 0.8fr 120px;padding:9px 20px;background:var(--bg2);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em}
    .pl-row{display:grid;grid-template-columns:2fr 1.4fr 1fr 0.8fr 120px;padding:13px 20px;border-bottom:1px solid var(--border);align-items:center;cursor:pointer;transition:background .1s}
    .pl-row:last-child{border-bottom:none}.pl-row:hover{background:var(--accent-soft)}
    .fin-header{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 110px;padding:8px 18px;background:var(--bg);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}
    .fin-row{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 110px;gap:10px;align-items:center;padding:11px 18px;border-bottom:1px solid var(--border);font-size:13px}
    .fin-row:last-child{border-bottom:none}
    .host-header{display:grid;grid-template-columns:2fr 1.2fr 1fr 1fr 1fr 120px;padding:8px 18px;background:var(--bg);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}
    .host-row{display:grid;grid-template-columns:2fr 1.2fr 1fr 1fr 1fr 120px;padding:12px 18px;border-bottom:1px solid var(--border);align-items:center;font-size:13px}
    .host-row:last-child{border-bottom:none}
    .cl-name-cell{display:flex;align-items:center;gap:11px}
    .avatar{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;font-family:var(--heading-font)}
    .av-b{background:#dbeafe;color:#1d4ed8}.av-g{background:#d1fae5;color:#065f46}
    .av-p{background:#ede9fe;color:#6d28d9}.av-a{background:#fef3c7;color:#b45309}
    .av-r{background:#fee2f2;color:#9d174d}.av-t{background:#ccfbf1;color:#0f766e}
    .badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:500;line-height:1.5}
    .bg-green{background:var(--green-soft);color:var(--green-text)}.bg-amber{background:var(--amber-soft);color:var(--amber-text)}
    .bg-red{background:var(--red-soft);color:var(--red-text)}.bg-blue{background:var(--blue-soft);color:var(--blue-text)}
    .bg-purple{background:var(--purple-soft);color:var(--purple-text)}.bg-teal{background:var(--teal-soft);color:var(--teal-text)}
    .bg-gray{background:var(--bg2);color:var(--text-muted)}
    .task-item{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)}
    .task-item:last-child{border-bottom:none}
    .task-check{width:18px;height:18px;border:1.5px solid var(--border-strong);border-radius:5px;flex-shrink:0;margin-top:2px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
    .task-check:hover{border-color:var(--accent)}
    .task-check.done{background:var(--accent);border-color:var(--accent)}
    .task-meta{font-size:11px;color:var(--text-faint);margin-top:2px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .task-del{color:var(--text-faint);font-size:17px;cursor:pointer;opacity:.45;transition:opacity .1s;line-height:1;padding:2px 4px}
    .task-item:hover .task-del,.task-del:focus-visible{opacity:1}
    .info-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}
    .info-row:last-child{border-bottom:none}
    .info-label{color:var(--text-muted);width:100px;flex-shrink:0;padding-top:1px}.info-val{flex:1}
    .detail-grid{display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start}
    .total-bar{background:var(--bg2);border-top:1px solid var(--border);padding:11px 18px;display:flex;justify-content:space-between;font-size:13px}
    .total-bar strong{font-family:var(--mono-font)}
    .search-wrap{position:relative}.search-wrap input{padding-left:32px;width:240px}
    .search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-faint);font-size:14px;pointer-events:none}
    .tabs{display:flex;gap:2px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rsm);padding:3px}
    .tab{padding:5px 13px;border-radius:5px;font-size:12px;font-weight:500;color:var(--text-muted);cursor:pointer;border:none;background:none;transition:all .1s}
    .tab.active{background:var(--surface);color:var(--text);box-shadow:var(--shadow);font-weight:600}
    .client-tabs{display:flex;border-bottom:1px solid var(--border);overflow-x:auto;background:var(--surface2)}
    .client-tab{padding:11px 16px;font-size:13px;font-weight:500;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;background:none;border-top:none;border-left:none;border-right:none;white-space:nowrap;transition:all .1s}
    .client-tab:hover{color:var(--text)}.client-tab.active{color:var(--accent-text);border-bottom-color:var(--accent);font-weight:600}
    .modal-bg{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100;align-items:center;justify-content:center;backdrop-filter:blur(3px);opacity:0;transition:opacity .2s}
    .modal-bg.open{display:flex;animation:modal-bg-in .2s ease forwards}
    @keyframes modal-bg-in{from{opacity:0}to{opacity:1}}
    .modal{background:var(--surface);border-radius:var(--r);padding:26px;width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.22);border:1px solid var(--border);animation:modal-in .2s cubic-bezier(.16,1,.3,1) forwards}
    @keyframes modal-in{from{transform:translateY(12px) scale(.97);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
    .modal h3{font-size:16px;font-weight:700;margin-bottom:20px;letter-spacing:-.02em;font-family:var(--heading-font)}
    .form-group{margin-bottom:14px}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)}
    .empty{text-align:center;padding:32px 16px;color:var(--text-faint);font-size:13px}
    .quick-add{display:flex;gap:8px;padding:0 18px 14px}
    .quick-add input[type=text]{flex:1}.quick-add input[type=date]{width:130px}
    .color-opts{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
    .color-opt{width:24px;height:24px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all .12s}
    .color-opt.sel{border-color:var(--text);transform:scale(1.18);box-shadow:0 0 0 2px var(--surface)}
    .dl-item{display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px}
    .dl-item:last-child{border-bottom:none}
    .dl-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
    .chart-wrap{display:flex;align-items:flex-end;gap:5px;height:80px;padding-top:8px}
    .chart-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer}
    .chart-bar{background:var(--accent);border-radius:4px 4px 0 0;width:100%;min-height:2px;opacity:.8;transition:opacity .15s}
    .chart-col:hover .chart-bar{opacity:1}
    .chart-lbl{font-size:10px;color:var(--text-faint);text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .theme-toggle{width:36px;height:20px;border-radius:99px;background:var(--border-strong);border:none;cursor:pointer;position:relative;transition:background .2s;flex-shrink:0}
    .theme-toggle.dark{background:var(--accent)}
    .theme-toggle-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
    .theme-toggle.dark .theme-toggle-knob{transform:translateX(16px)}
    .hamburger-btn{display:none;width:40px;height:40px;border-radius:var(--rsm);background:none;border:1px solid var(--border-strong);cursor:pointer;align-items:center;justify-content:center;color:var(--text);font-size:18px;position:fixed;top:8px;left:8px;z-index:22;transition:all .15s;background:var(--surface)}
    .hamburger-btn:hover{border-color:var(--accent);color:var(--accent)}
    .sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:19}
    .sidebar-overlay.open{display:block}
    
    @media(max-width:1024px){
      .stats-grid{grid-template-columns:repeat(2,1fr)}
      .detail-grid{grid-template-columns:1fr}
      .modal{width:90vw;max-width:520px}
    }
    
    @media(max-width:768px){
      .hamburger-btn{display:flex}
      .sidebar{width:224px;position:fixed;left:0;top:0;height:100vh;transform:translateX(-100%);transition:transform .3s ease;z-index:21}
      .sidebar.open{transform:translateX(0)}
      .sidebar-overlay{display:none}
      .sidebar-overlay.open{display:block}
      .main{margin-left:0;width:100%}
      .app{display:block}
      .sb-nav{flex-direction:column;overflow-y:auto;padding:12px 10px}
      .nav-section{display:block;font-size:10px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:.08em;padding:14px 8px 5px;margin-top:8px}
      .nav-section:first-of-type{margin-top:0}
      .detail-grid{grid-template-columns:1fr}
      .stats-grid{grid-template-columns:1fr 1fr;gap:12px}
      .stat-card{padding:14px 16px}
      .stat-value{font-size:18px}
      .content{padding:16px}
      .topbar{padding:0 14px;height:56px}
      .topbar h2{font-size:14px}
      .topbar-right{gap:6px}
      .btn{padding:6px 12px;font-size:12px}
      .btn-sm{padding:4px 9px;font-size:11px}
      .tabs{flex-wrap:wrap}
      .tab{padding:4px 10px;font-size:11px}
      .cl-header{grid-template-columns:1fr;padding:9px 12px;font-size:9px}
      .cl-row{grid-template-columns:1fr;padding:12px 12px}
      .cl-header div:nth-child(n+2),.cl-row div:nth-child(n+2){display:none}
      .pl-header{grid-template-columns:1fr;padding:9px 12px;font-size:9px}
      .pl-row{grid-template-columns:1fr;padding:12px 12px}
      .pl-header div:nth-child(n+2),.pl-row div:nth-child(n+2){display:none}
      .fin-header,.host-header{display:none}
      .fin-row,.host-row{display:flex;flex-wrap:wrap;grid-template-columns:none;gap:4px 12px;padding:12px 14px}
      .fin-row>div:first-child,.host-row>div:first-child{flex:1 1 100%}
      .fin-row>div:nth-child(4){margin-left:auto}
      .modal{width:90vw;max-width:90vw;padding:20px;max-height:85vh}
      .modal h3{font-size:14px;margin-bottom:16px}
      .form-row{grid-template-columns:1fr}
      .search-wrap input{width:100%}
      .quick-add{flex-direction:column;gap:6px;padding:0 12px 10px}
      .quick-add input[type=date]{width:100%}
      .client-tabs{overflow-x:auto;-webkit-overflow-scrolling:touch}
      .client-tab{padding:9px 12px;font-size:12px}
      .info-label{width:80px}
      .avatar{width:30px;height:30px;font-size:11px}
      input,textarea,select{font-size:16px;padding:10px 12px}
      label{font-size:10px}
      h1,h2,h3,h4,h5{font-size:inherit}
      body{font-size:13px}
      iframe{height:300px!important}
    }
    
    @media(max-width:600px){
      .stats-grid{grid-template-columns:1fr;gap:10px}
      .stat-card{padding:12px 14px}
      .stat-value{font-size:16px}
      .stat-label{font-size:10px}
      .content{padding:12px}
      .topbar{padding:0 10px;height:52px}
      .topbar h2{font-size:14px}
      .btn{padding:5px 10px;font-size:12px;gap:4px}
      .btn-sm{padding:4px 9px;font-size:11px}
      .topbar-right{gap:4px}
      .modal{padding:16px}
      .form-group{margin-bottom:12px}
      .sc-head{padding:12px 14px}
      .sc-body{padding:12px 14px}
      .sc-title{font-size:12px}
      .cl-row{padding:10px 12px}
      .pl-row{padding:10px 12px}
      .task-item{padding:8px 0;gap:8px}
      .task-check{width:18px;height:18px}
      .info-row{padding:6px 0;font-size:13px}
      .info-label{width:70px;font-size:12px}
      .avatar{width:28px;height:28px;font-size:10px}
      .badge{padding:2px 7px;font-size:10px}
      .chart-wrap{height:60px}
      .dl-item{padding:6px 0;font-size:12px}
      .bc{font-size:12px}
      .search-wrap input{width:100%;font-size:16px}
      input,textarea,select{font-size:16px;padding:10px 12px}
    }

    @media(max-width:480px){
      .topbar{height:48px}
      .topbar h2{font-size:13px}
      .content{padding:10px}
      .stats-grid{gap:8px}
      .stat-card{padding:10px 12px}
      .stat-value{font-size:15px;line-height:1}
      .stat-label{font-size:10px}
      .stat-sub{font-size:10px}
      .btn{padding:5px 10px;font-size:11px}
      .modal{padding:14px;margin:10px}
      .form-group{margin-bottom:10px}
      label{font-size:10px;margin-bottom:3px}
      .sc{margin-bottom:12px}
      .sc-head{padding:10px 12px}
      .sc-body{padding:10px 12px}
      .cl-row{padding:9px 10px}
      .pl-row{padding:9px 10px}
      .task-item{gap:6px}
      .empty{padding:24px 12px;font-size:13px}
      .avatar{width:28px;height:28px;font-size:10px}
      .badge{padding:2px 7px;font-size:10px}
      .bc{font-size:11px}
      input,textarea,select{font-size:16px;padding:10px 12px}
      .detail-grid{gap:14px}
      .modal-actions{gap:6px}
      .topbar-right{gap:3px}
      .nav-item{padding:7px 8px;font-size:12px}
      .sb-logo{padding:16px 14px 12px}
      .sb-logo-icon{width:28px;height:28px}
      .sb-logo-text h1{font-size:12px}
      .sb-logo-text span{font-size:10px}
      .sb-footer{padding:12px 14px}
    }
  `

  return (
    <ToastProvider>
    <div className="app">
      <style>{CSS}</style>
      <div className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)}></div>
      <nav className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sb-logo">
          <div className="sb-logo-icon"><span>S</span></div>
          <div className="sb-logo-text">
            <h1>STN CRM</h1>
            <span>Klantenbeheer</span>
          </div>
        </div>
        <div className="sb-nav">
          <div className="nav-section">Overzicht</div>
          <button className={`nav-item${view==='overview'?' active':''}`} onClick={() => { showView('overview'); setSidebarOpen(false) }}>
            <span className="nav-dot"></span>Dashboard
          </button>
          <div className="nav-section">Beheer</div>
          <button className={`nav-item${['clients','client-detail'].includes(view)?' active':''}`} onClick={() => { showView('clients'); setSidebarOpen(false) }}>
            <span className="nav-dot"></span>Klanten
          </button>
          <button className={`nav-item${['projects','project-detail'].includes(view)?' active':''}`} onClick={() => { showView('projects'); setSidebarOpen(false) }}>
            <span className="nav-dot"></span>Projecten
          </button>
          <button className={`nav-item${view==='tasks'?' active':''}`} onClick={() => { showView('tasks'); setSidebarOpen(false) }}>
            <span className="nav-dot"></span>Alle taken
          </button>
          <button className={`nav-item${view==='finance'?' active':''}`} onClick={() => { showView('finance'); setSidebarOpen(false) }}>
            <span className="nav-dot"></span>Financiën
          </button>
          <button className={`nav-item${view==='hosting'?' active':''}`} onClick={() => { showView('hosting'); setSidebarOpen(false) }}>
            <span className="nav-dot"></span>Hosting
          </button>
          <button className={`nav-item${view==='pipeline'?' active':''}`} onClick={() => { showView('pipeline'); setSidebarOpen(false) }}>
            <span className="nav-dot"></span>Pipeline
          </button>
        </div>
        <div className="sb-footer">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <span style={{fontSize:11,color:'var(--text-faint)'}}>Thema</span>
            <button
              className={darkMode ? 'theme-toggle dark' : 'theme-toggle'}
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Licht thema' : 'Donker thema'}
            >
              <div className="theme-toggle-knob"></div>
            </button>
          </div>
          <div
            style={{display:'flex',alignItems:'center',gap:9,padding:'8px 6px',borderRadius:'var(--rsm)',cursor:'pointer',transition:'background .1s',marginBottom:8}}
            onClick={() => { showView('profile'); setSidebarOpen(false) }}
            onMouseEnter={e => e.currentTarget.style.background='var(--accent-soft)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}
          >
            <div style={{
              width:30,height:30,borderRadius:'50%',flexShrink:0,overflow:'hidden',
              background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:12,fontWeight:700,color:'#fff',fontFamily:'var(--heading-font)'
            }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
                : (profile?.full_name || session.user.email)[0].toUpperCase()
              }
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{profile?.full_name || 'Profiel'}</div>
              <div style={{fontSize:10,color:'var(--text-faint)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{session.user.email}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-xs" onClick={logout} style={{width:'100%',justifyContent:'center'}}>Uitloggen</button>
        </div>
      </nav>
      <div className="main">
        <button className="hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu openen">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        {view==='overview' && <OverviewView clients={clients} projects={projects} allTasks={allTasks} allInvoices={allInvoices} allRecurring={allRecurring} allMeetings={allMeetings} totalPaid={totalPaid} totalOpen={totalOpen} totalMRR={totalMRR} showView={showView} onRefresh={loadAll} />}
        {view==='clients' && <ClientsView clients={clients} projects={projects} allTasks={allTasks} showView={showView} onRefresh={loadAll} />}
        {view==='client-detail' && curClient && <ClientDetailView client={curClient} projects={projects} allTasks={allTasks} showView={showView} onRefresh={loadAll} />}
        {view==='projects' && <ProjectsView projects={projects} clients={clients} clientName={clientName} showView={showView} onRefresh={loadAll} />}
        {view==='project-detail' && curProject && <ProjectDetailView project={curProject} clients={clients} clientName={clientName} showView={showView} onRefresh={loadAll} />}
        {view==='tasks' && <TasksView allTasks={allTasks} showView={showView} onRefresh={loadAll} />}
        {view==='finance' && <FinanceView allInvoices={allInvoices} allRecurring={allRecurring} totalPaid={totalPaid} totalOpen={totalOpen} totalMRR={totalMRR} showView={showView} />}
        {view==='hosting' && <HostingView allHosting={allHosting} clients={clients} showView={showView} onRefresh={loadAll} />}
        {view==='profile' && <ProfileView session={session} onProfileUpdate={p => { setProfile(p); applyProfileTheme(p) }} />}
        {view==='pipeline' && <PipelineView showView={showView} onRefresh={loadAll} />}
      </div>
    </div>
    </ToastProvider>
  )
}

function OverviewView({ clients, projects, allTasks, allInvoices, allRecurring, allMeetings, totalPaid, totalOpen, totalMRR, showView, onRefresh }) {
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
        {/* Meetings widget */}
        {allMeetings && allMeetings.filter(m => m.status === 'gepland' && m.meeting_date >= today()).length > 0 && (
          <div className="sc" style={{marginBottom:16}}>
            <div className="sc-head"><span className="sc-title">Aankomende meetings</span></div>
            <div className="sc-body">
              {allMeetings.filter(m => m.status === 'gepland' && m.meeting_date >= today()).slice(0,4).map(m => {
                const dd = daysN(m.meeting_date)
                const cn = m.clients ? m.clients.fname + ' ' + m.clients.lname : ''
                return (
                  <div key={m.id} className="dl-item">
                    <div className="dl-dot" style={{background: dd === 0 ? 'var(--accent)' : dd <= 3 ? 'var(--amber)' : 'var(--border-strong)'}}></div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:500,display:'flex',alignItems:'center',gap:6}}><MeetingTypeIcon type={m.type} /> {m.title}</div>
                      <div style={{fontSize:11,color:'var(--text-faint)'}}>{cn}{m.meeting_time ? ' · ' + m.meeting_time.slice(0,5) : ''}</div>
                    </div>
                    <div style={{fontSize:12,color: dd===0?'var(--accent-text)':dd<=3?'var(--amber-text)':'var(--text-faint)',whiteSpace:'nowrap',fontWeight:dd<=3?500:400}}>
                      {dd === 0 ? 'Vandaag' : dd === 1 ? 'Morgen' : fdate(m.meeting_date)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
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
                return <div key={r.id} className="dl-item"><div style={{flex:1}}><div style={{fontSize:13}}>{r.description}</div><div style={{fontSize:11,color:'var(--text-faint)'}}>{r.clients?.fname} {r.clients?.lname} · {r.freq}</div></div><div style={{textAlign:'right'}}><div style={{fontFamily:'var(--mono-font)',fontSize:12,fontWeight:500}}>{money(r.amount)}</div>{nd&&<div style={{fontSize:11,color:dd<=7?'var(--amber-text)':'var(--text-faint)'}}>{dd===0?'vandaag':dd+'d'}</div>}</div></div>
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
      <div className="topbar"><h2>Klanten</h2><div className="topbar-right"><div className="search-wrap"><span className="search-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Zoeken…" /></div><ClientModal onSave={onRefresh} trigger={<button className="btn btn-primary btn-sm">+ Nieuwe klant</button>} /></div></div>
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
              <div style={{fontFamily:'var(--mono-font)',fontSize:13}}>—</div>
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
                {[['projects','Projecten'],['tasks','Taken'],['invoices','Facturen'],['recurring','Terugkerend'],['hosting','Hosting'],['meetings','Meetings'],['notes','Notities']].map(([tab,label]) => (
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
                        <div style={{fontFamily:'var(--mono-font)',fontSize:13,fontWeight:500,textAlign:'right'}}>{money(i.amount)}</div>
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
                          <div style={{fontFamily:'var(--mono-font)',fontSize:13,fontWeight:500,textAlign:'right'}}>{money(r.amount)}</div>
                          <div style={{display:'flex',alignItems:'center',gap:5,justifyContent:'flex-end'}}><Badge s={r.status} /><RecMenu onStatus={s=>db.updateRecurring(r.id,{status:s}).then(refreshRec)} onDelete={()=>db.deleteRecurring(r.id).then(refreshRec)} /></div>
                        </div>
                        {nd&&<div style={{fontSize:11,padding:'2px 0 6px',color:dd<=14?'var(--amber-text)':'var(--text-faint)',borderBottom:'1px solid var(--border)'}}>Volgende factuur: {fdate(nd)} ({dd===0?'vandaag':dd+'d'})</div>}
                      </div>
                    })}
                  </div>
                  <div className="total-bar"><span style={{color:'var(--text-muted)'}}>MRR <strong style={{color:'var(--teal-text)'}}>{money(mrr)}</strong></span><span>Jaarlijks <strong>{money(mrr*12)}</strong></span></div>
                </div>
              )}
              {activeTab==='hosting' && (
                <ClientHostingTab clientId={client.id} onRefresh={onRefresh} />
              )}
              {activeTab==='meetings' && (
                <ClientMeetingsTab client={client} onRefresh={onRefresh} />
              )}
              {activeTab==='notes' && (
                <div>
                  <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'flex-end'}}><NoteModal clientId={client.id} onSave={refreshNotes} trigger={<button className="btn btn-ghost btn-sm">+ Notitie</button>} /></div>
                  <div className="sc-body">
                    {!notes.length ? <div className="empty">Geen notities</div> : notes.map(n => (
                      <div key={n.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                        <div style={{fontSize:13,lineHeight:1.6}}>{n.content.split('\n').map((l,i)=><span key={i}>{l}<br/></span>)}</div>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:5}}><div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'var(--text-faint)'}}>{fdate(n.created_at?.slice(0,10))}{n.visible_to_client&&<span style={{display:'inline-flex',alignItems:'center',gap:3,color:'var(--accent-text)'}}><EyeIcon size={11} /> Klant</span>}</div><button onClick={()=>db.deleteNote(n.id).then(refreshNotes)} style={{fontSize:11,color:'var(--text-faint)',cursor:'pointer'}}>Verwijderen</button></div>
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
                <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                  <span className={`badge ${client.auth_user_id?'bg-green':'bg-gray'}`}>{client.auth_user_id?'Portaal actief':'Geen portaaltoegang'}</span>
                  {!client.auth_user_id && <PortalInviteButton client={client} />}
                </div>
              </div>
            </div>
            <div className="sc">
              <div className="sc-head"><span className="sc-title">Snel overzicht</span></div>
              <div className="sc-body">
                <div className="info-row"><span className="info-label">Omzet betaald</span><span className="info-val" style={{fontFamily:'var(--mono-font)',fontWeight:500}}>{money(paidAmt)}</span></div>
                <div className="info-row"><span className="info-label">Nog te ontvangen</span><span className="info-val" style={{fontFamily:'var(--mono-font)',color:'var(--amber-text)'}}>{openAmt>0?money(openAmt):'—'}</span></div>
                <div className="info-row"><span className="info-label">MRR</span><span className="info-val" style={{fontFamily:'var(--mono-font)',color:'var(--teal-text)'}}>{mrr>0?money(mrr)+'/mnd':'—'}</span></div>
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
  const [previewUrl, setPreviewUrl] = useState(null)
  const filtered = projects.filter(p => !q||p.name.toLowerCase().includes(q.toLowerCase())||clientName(p.client_id).toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <div>
        <div className="topbar"><h2>Projecten</h2><div className="topbar-right"><div className="search-wrap"><span className="search-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Zoeken…" /></div><ProjectModal clients={clients} onSave={onRefresh} trigger={<button className="btn btn-primary btn-sm">+ Nieuw project</button>} /></div></div>
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
                  {p.url&&<button onClick={e=>{e.stopPropagation();setPreviewUrl(p.url)}} className="btn btn-ghost btn-xs" style={{textDecoration:'none'}}>Preview</button>}
                  {p.url&&<a href={p.url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="btn btn-ghost btn-xs" style={{textDecoration:'none'}}>↗ Open</a>}
                </div>
              </div>
            })}
          </div>
        </div>
      </div>
      <Modal open={!!previewUrl} onClose={()=>setPreviewUrl(null)} title="Website Preview">
        {previewUrl && <div style={{width:'100%',height:'500px',border:'1px solid var(--border)',borderRadius:'var(--r)',overflow:'hidden'}}>
          <iframe
            src={previewUrl}
            style={{width:'100%',height:'100%',border:'none'}}
            title="Website preview"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        </div>}
      </Modal>
    </>
  )
}

function ProjectDetailView({ project, clients, clientName, showView, onRefresh }) {
  const [tasks, setTasks] = useState([])
  const [showPreview, setShowPreview] = useState(true)
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
        {project.url && showPreview && (
          <div className="sc" style={{marginBottom:16}}>
            <div className="sc-head">
              <span className="sc-title">Website preview</span>
              <button className="btn btn-ghost btn-xs" onClick={()=>setShowPreview(false)}>Sluiten</button>
            </div>
            <div className="sc-body" style={{padding:0,overflow:'hidden'}}>
              <iframe 
                src={project.url} 
                style={{width:'100%',height:'400px',border:'none',borderRadius:'0 0 var(--r) var(--r)',backgroundColor:'#fff'}}
                title="Website preview"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
              />
            </div>
          </div>
        )}
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
            <div className="fin-header"><div>Klant / omschrijving</div><div>Datum</div><div>Vervaldatum</div><div style={{textAlign:'right'}}>Bedrag</div><div style={{textAlign:'right'}}>Status</div></div>
            {!sorted.length ? <div className="empty">Geen facturen</div> : sorted.map(i => (
              <div key={i.id} className="fin-row">
                <div><div style={{fontWeight:500}}>{i.description}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{i.clients?.fname} {i.clients?.lname}{i.clients?.company?' · '+i.clients.company:''}</div></div>
                <div style={{color:'var(--text-muted)'}}>{fdate(i.date)}</div>
                <div style={{color:'var(--text-muted)'}}>{fdate(i.due_date)}</div>
                <div style={{fontFamily:'var(--mono-font)',textAlign:'right'}}>{money(i.amount)}</div>
                <div style={{textAlign:'right'}}><Badge s={i.status} /></div>
              </div>
            ))}
          </div>
          <div className="sc">
            <div className="sc-head"><span className="sc-title">Terugkerend</span></div>
            <div className="sc-body">
              <div className="info-row"><span className="info-label">Maandelijks</span><span className="info-val" style={{fontFamily:'var(--mono-font)'}}>{money(byFreq.maandelijks)}</span></div>
              <div className="info-row"><span className="info-label">Kwartaal</span><span className="info-val" style={{fontFamily:'var(--mono-font)'}}>{money(byFreq.kwartaallijks)}</span></div>
              <div className="info-row"><span className="info-label">Jaarlijks</span><span className="info-val" style={{fontFamily:'var(--mono-font)'}}>{money(byFreq.jaarlijks)}</span></div>
              <div style={{borderTop:'1px solid var(--border)',marginTop:8,paddingTop:8}}>
                <div className="info-row"><span className="info-label">MRR totaal</span><span className="info-val" style={{fontFamily:'var(--mono-font)',color:'var(--teal-text)',fontWeight:500}}>{money(totalMRR)}</span></div>
                <div className="info-row"><span className="info-label">ARR totaal</span><span className="info-val" style={{fontFamily:'var(--mono-font)',fontWeight:500}}>{money(totalMRR*12)}</span></div>
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
      <button
        type="button"
        className={`task-check${task.done?' done':''}`}
        onClick={toggle}
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? `"${task.description}" markeren als niet afgerond` : `"${task.description}" markeren als afgerond`}
        style={{display:'flex',alignItems:'center',justifyContent:'center'}}
      >{task.done&&<span style={{color:'#fff',fontSize:10}}>✓</span>}</button>
      <div style={{flex:1}}>
        <div style={{fontSize:13,textDecoration:task.done?'line-through':'none',color:task.done?'var(--text-faint)':'var(--text)'}}>{task.description}</div>
        <div className="task-meta">
          {task.due_date&&<span>{fdate(task.due_date)}</span>}
          {task.visible_to_client&&<span style={{display:'inline-flex',alignItems:'center',gap:3,color:'var(--accent-text)'}}><EyeIcon size={11} /> Klant</span>}
          {task.created_by==='client'&&<span className="badge bg-blue" style={{fontSize:10}}>Via klant</span>}
        </div>
      </div>
      <button type="button" className="task-del" onClick={del} aria-label={`Taak "${task.description}" verwijderen`}>×</button>
    </div>
  )
}

function QuickTaskAdd({ projectId, onAdd }) {
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState('')
  const [visible, setVisible] = useState(false)
  async function add() {
    if (!desc.trim()) return
    await db.createTask({ project_id: projectId, description: desc.trim(), due_date: date||null, priority: 'normaal', done: false, visible_to_client: visible, created_by: 'staff' })
    setDesc(''); setDate(''); onAdd()
  }
  return (
    <div className="quick-add">
      <input type="text" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Snel taak toevoegen…" onKeyDown={e=>e.key==='Enter'&&add()} />
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
      <button
        type="button"
        onClick={()=>setVisible(v=>!v)}
        aria-label={visible ? 'Zichtbaar voor klant — klik om te verbergen' : 'Niet zichtbaar voor klant — klik om te tonen'}
        title={visible ? 'Zichtbaar voor klant' : 'Niet zichtbaar voor klant'}
        style={{color: visible ? 'var(--accent-text)' : 'var(--text-faint)', display:'flex',alignItems:'center',padding:'0 6px'}}
      ><EyeIcon off={!visible} /></button>
      <button className="btn btn-ghost btn-sm" onClick={add}>Voeg toe</button>
    </div>
  )
}

function InvMenu({ onStatus, onDelete }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{position:'relative',display:'inline-block'}}>
      <button className="btn btn-ghost btn-xs" onClick={()=>setOpen(!open)} aria-label="Opties" style={{padding:'3px 6px'}}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
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
      <button className="btn btn-ghost btn-xs" onClick={()=>setOpen(!open)} aria-label="Opties" style={{padding:'3px 6px'}}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
      {open&&<div style={{position:'absolute',right:0,top:'calc(100% + 4px)',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--rsm)',boxShadow:'0 4px 16px rgba(0,0,0,.08)',zIndex:50,minWidth:140,padding:4}} onMouseLeave={()=>setOpen(false)}>
        {['actief','gepauzeerd','gestopt'].map(s=><button key={s} style={{display:'block',width:'100%',textAlign:'left',padding:'7px 10px',fontSize:13,borderRadius:4}} onClick={()=>{onStatus(s);setOpen(false)}}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>)}
        <hr style={{border:'none',borderTop:'1px solid var(--border)',margin:'4px 0'}} />
        <button style={{display:'block',width:'100%',textAlign:'left',padding:'7px 10px',fontSize:13,color:'var(--red-text)',borderRadius:4}} onClick={()=>{onDelete();setOpen(false)}}>Verwijderen</button>
      </div>}
    </div>
  )
}

function PortalInviteButton({ client }) {
  const [sending, setSending] = useState(false)
  async function send() {
    if (!client.email) return showToast('Vul eerst een e-mailadres in.', 'error')
    setSending(true)
    try {
      await db.inviteClientPortal(client)
      showToast('Portaaluitnodiging verstuurd naar ' + client.email)
    } catch (e) {
      showToast('Fout bij versturen: ' + e.message, 'error')
    } finally {
      setSending(false)
    }
  }
  return <button className="btn btn-ghost btn-xs" onClick={send} disabled={sending || !client.email}>{sending ? 'Versturen…' : 'Portaaltoegang versturen'}</button>
}

function ClientModal({ client, onSave, trigger }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const init = { fname:'', lname:'', company:'', email:'', phone:'', website:'', status:'actief' }
  const [form, setForm] = useState(init)
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}))
  function openModal() { setForm(client?{fname:client.fname||'',lname:client.lname||'',company:client.company||'',email:client.email||'',phone:client.phone||'',website:client.website||'',status:client.status||'actief'}:init); setOpen(true) }
  async function save() {
    if(!form.fname&&!form.lname) return showToast('Vul een naam in.','error')
    setSaving(true)
    try {
      if(client) await db.updateClient(client.id, form)
      else await db.createClient(form)
      setOpen(false); onSave(); showToast(client ? 'Klant bijgewerkt' : 'Klant aangemaakt')
    } catch(e) {
      showToast('Fout bij opslaan: ' + e.message, 'error')
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
    if(!form.name.trim()) return showToast('Vul een projectnaam in.','error')
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
      setOpen(false); onSave(); showToast(project ? 'Project bijgewerkt' : 'Project aangemaakt')
    } catch(e) {
      showToast('Fout bij opslaan: ' + e.message, 'error')
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

function ClientVisibleCheckbox({ checked, onChange, label = 'Zichtbaar voor klant' }) {
  return (
    <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',fontSize:12,fontWeight:600,color:'var(--text-muted)',textTransform:'none',letterSpacing:0,marginBottom:14}}>
      <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} style={{width:15,height:15}} />
      {label}
    </label>
  )
}

function TaskModal({ projectId, onSave, trigger }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ description:'', due_date:'', priority:'normaal', visible_to_client:false })
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}))
  async function save() {
    if(!form.description.trim()) return
    setSaving(true)
    try {
      await db.createTask({ project_id: projectId, description: form.description.trim(), due_date: form.due_date||null, priority: form.priority, done: false, visible_to_client: form.visible_to_client, created_by: 'staff' })
      setOpen(false); onSave()
    } catch(e) {
      showToast('Fout bij opslaan: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return <>
    {React.cloneElement(trigger,{onClick:()=>{setForm({description:'',due_date:'',priority:'normaal',visible_to_client:false});setOpen(true)}})}
    <Modal open={open} onClose={()=>setOpen(false)} title="Nieuwe taak">
      <FG label="Omschrijving"><textarea value={form.description} onChange={f('description')} autoFocus /></FG>
      <FR><FG label="Deadline"><input type="date" value={form.due_date} onChange={f('due_date')} /></FG><FG label="Prioriteit"><select value={form.priority} onChange={f('priority')}><option value="normaal">Normaal</option><option value="hoog">Hoog</option><option value="laag">Laag</option></select></FG></FR>
      <ClientVisibleCheckbox checked={form.visible_to_client} onChange={v=>setForm(p=>({...p,visible_to_client:v}))} />
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
      showToast('Fout bij opslaan: ' + e.message, 'error')
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
    if(!form.description.trim()||!form.amount) return showToast('Vul omschrijving en bedrag in.','error')
    setSaving(true)
    try {
      await db.createRecurring({ client_id: clientId, description: form.description, amount: parseFloat(form.amount), freq: form.freq, start_date: form.start_date||today(), end_date: form.end_date||null, status: form.status })
      setOpen(false); onSave()
    } catch(e) {
      showToast('Fout bij opslaan: ' + e.message, 'error')
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
  const [visible, setVisible] = useState(false)
  async function save() {
    if(!content.trim()) return
    setSaving(true)
    await db.createNote({ client_id: clientId, content: content.trim(), visible_to_client: visible })
    setSaving(false); setOpen(false); onSave()
  }
  return <>
    {React.cloneElement(trigger,{onClick:()=>{setContent('');setVisible(false);setOpen(true)}})}
    <Modal open={open} onClose={()=>setOpen(false)} title="Nieuwe notitie">
      <FG label="Notitie"><textarea value={content} onChange={e=>setContent(e.target.value)} rows={5} autoFocus /></FG>
      <ClientVisibleCheckbox checked={visible} onChange={setVisible} />
      <ModalActions onCancel={()=>setOpen(false)} onSave={save} saving={saving} />
    </Modal>
  </>
}

// ── Hosting View ───────────────────────────────────────────────────────────────
function HostingView({ allHosting, clients, showView, onRefresh }) {
  const [q, setQ] = useState('')
  const today_str = today()

  const filtered = allHosting.filter(h => {
    if (!q) return true
    const cn = h.clients ? h.clients.fname + ' ' + h.clients.lname + ' ' + (h.clients.company||'') : ''
    return (h.site_name + h.domain + h.hoster + cn).toLowerCase().includes(q.toLowerCase())
  })

  const expiringSoon = allHosting.filter(h => {
    if (!h.domain_expires) return false
    const d = daysN(h.domain_expires)
    return d !== null && d <= 30
  })
  const sslWarn = allHosting.filter(h => {
    if (!h.ssl_expires) return false
    const d = daysN(h.ssl_expires)
    return d !== null && d <= 30
  })

  function expiryColor(dateStr) {
    if (!dateStr) return 'var(--text-faint)'
    const d = daysN(dateStr)
    if (d < 0) return 'var(--red-text)'
    if (d <= 14) return 'var(--red-text)'
    if (d <= 30) return 'var(--amber-text)'
    return 'var(--text-muted)'
  }

  return (
    <div>
      <div className="topbar">
        <h2>Hosting & domeinen</h2>
        <div className="topbar-right">
          <div className="search-wrap"><span className="search-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Zoeken…" /></div>
          <HostingModal clients={clients} onSave={onRefresh} trigger={<button className="btn btn-primary btn-sm">+ Site toevoegen</button>} />
        </div>
      </div>
      <div className="content">

        {(expiringSoon.length > 0 || sslWarn.length > 0) && (
          <div style={{background:'var(--amber-soft)',border:'1px solid var(--amber)',borderRadius:'var(--r)',padding:'14px 18px',marginBottom:18}}>
            <div style={{fontWeight:600,fontSize:13,color:'var(--amber-text)',marginBottom:8,display:'flex',alignItems:'center',gap:6}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Actie vereist</div>
            {expiringSoon.map(h => {
              const d = daysN(h.domain_expires)
              return <div key={h.id} style={{fontSize:13,color:'var(--amber-text)',marginBottom:4}}>
                Domein <strong>{h.domain}</strong> verloopt {d <= 0 ? 'al' : 'over ' + d + ' dagen'} — {h.clients?.fname} {h.clients?.lname}
              </div>
            })}
            {sslWarn.map(h => {
              const d = daysN(h.ssl_expires)
              return <div key={h.id+'-ssl'} style={{fontSize:13,color:'var(--amber-text)',marginBottom:4}}>
                SSL van <strong>{h.site_name}</strong> verloopt {d <= 0 ? 'al' : 'over ' + d + ' dagen'} — {h.clients?.fname} {h.clients?.lname}
              </div>
            })}
          </div>
        )}

        <div className="sc" style={{padding:0}}>
          <div className="host-header">
            <div>Site</div><div>Klant</div><div>Hoster</div><div>Domein verloopt</div><div>SSL verloopt</div><div></div>
          </div>
          {!filtered.length ? <div className="empty">Geen sites toegevoegd</div> : filtered.map(h => (
            <div key={h.id} className="host-row">
              <div>
                <div style={{fontWeight:500}}>{h.site_name}</div>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>{h.cms}{h.cms&&h.hoster?' · ':''}</div>
                {h.url && <a href={h.url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:11,color:'var(--blue-text)'}}>{h.url.replace('https://','').replace('http://','')}</a>}
              </div>
              <div style={{fontSize:13,color:'var(--text-muted)',cursor:h.client_id?'pointer':'default'}} onClick={()=>h.clients&&showView('client-detail',h.client_id)}>
                {h.clients ? h.clients.fname+' '+h.clients.lname : '—'}
                {h.clients?.company && <div style={{fontSize:11,color:'var(--text-faint)'}}>{h.clients.company}</div>}
              </div>
              <div style={{fontSize:13,color:'var(--text-muted)'}}>{h.hoster||'—'}</div>
              <div style={{fontSize:13,color:expiryColor(h.domain_expires),fontWeight:daysN(h.domain_expires)<=30?500:400}}>{h.domain_expires?fdate(h.domain_expires):'—'}</div>
              <div style={{fontSize:13,color:expiryColor(h.ssl_expires),fontWeight:daysN(h.ssl_expires)<=30?500:400}}>{h.ssl_expires?fdate(h.ssl_expires):'—'}</div>
              <div style={{display:'flex',gap:5,justifyContent:'flex-end'}}>
                {h.url && <a href={h.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs" style={{textDecoration:'none'}} onClick={e=>e.stopPropagation()}>↗</a>}
                {h.hosting_login_url && <a href={h.hosting_login_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs" style={{textDecoration:'none',padding:'3px 6px'}} title="Open hostingpaneel" onClick={e=>e.stopPropagation()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg></a>}
                <HostingModal hosting={h} clients={clients} onSave={onRefresh} trigger={<button className="btn btn-ghost btn-xs" aria-label="Bewerken" style={{padding:'3px 6px'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>} />
                <button className="btn btn-ghost btn-xs" style={{color:'var(--red-text)'}} onClick={()=>{if(confirm('Verwijderen?'))db.deleteHosting(h.id).then(onRefresh)}} aria-label={`Site "${h.site_name}" verwijderen`}>×</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Client Hosting Tab ─────────────────────────────────────────────────────────
function ClientHostingTab({ clientId, onRefresh }) {
  const [hosting, setHosting] = useState([])
  const [clients, setClients] = useState([])

  useEffect(() => {
    db.getHostingForClient(clientId).then(setHosting)
    db.getClients().then(setClients)
  }, [clientId])

  const refresh = () => db.getHostingForClient(clientId).then(setHosting)

  function expiryColor(dateStr) {
    if (!dateStr) return 'var(--text-faint)'
    const d = daysN(dateStr)
    if (d < 0) return 'var(--red-text)'
    if (d <= 14) return 'var(--red-text)'
    if (d <= 30) return 'var(--amber-text)'
    return 'var(--text-muted)'
  }

  return (
    <div>
      <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'flex-end'}}>
        <HostingModal clients={clients} defaultClientId={clientId} onSave={refresh} trigger={<button className="btn btn-ghost btn-sm">+ Site toevoegen</button>} />
      </div>
      <div className="sc-body">
        {!hosting.length ? <div className="empty">Geen sites gekoppeld</div> : hosting.map(h => (
          <div key={h.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div>
                <div style={{fontWeight:500,fontSize:14}}>{h.site_name}</div>
                {h.url && <a href={h.url} target="_blank" rel="noreferrer" style={{fontSize:12,color:'var(--blue-text)'}}>{h.url}</a>}
              </div>
              <div style={{display:'flex',gap:5}}>
                {h.url && <a href={h.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-xs" style={{textDecoration:'none'}}>↗ Open site</a>}
                {h.hosting_login_url && <a href={h.hosting_login_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs" style={{textDecoration:'none'}}>Hostingpaneel</a>}
                <HostingModal hosting={h} clients={clients} defaultClientId={clientId} onSave={refresh} trigger={<button className="btn btn-ghost btn-xs" aria-label="Bewerken" style={{padding:'3px 6px'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>} />
                <button className="btn btn-ghost btn-xs" style={{color:'var(--red-text)'}} onClick={()=>{if(confirm('Verwijderen?'))db.deleteHosting(h.id).then(refresh)}} aria-label={`Site "${h.site_name}" verwijderen`}>×</button>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {h.cms && <div className="info-row" style={{padding:'4px 0'}}><span className="info-label" style={{width:70}}>CMS</span><span className="info-val">{h.cms}</span></div>}
              {h.hoster && <div className="info-row" style={{padding:'4px 0'}}><span className="info-label" style={{width:70}}>Hoster</span><span className="info-val">{h.hoster}</span></div>}
              {h.domain && <div className="info-row" style={{padding:'4px 0'}}><span className="info-label" style={{width:70}}>Domein</span><span className="info-val">{h.domain}</span></div>}
              {h.domain_expires && <div className="info-row" style={{padding:'4px 0'}}><span className="info-label" style={{width:70}}>Domein exp.</span><span className="info-val" style={{color:expiryColor(h.domain_expires),fontWeight:daysN(h.domain_expires)<=30?500:400}}>{fdate(h.domain_expires)}</span></div>}
              {h.ssl_expires && <div className="info-row" style={{padding:'4px 0'}}><span className="info-label" style={{width:70}}>SSL exp.</span><span className="info-val" style={{color:expiryColor(h.ssl_expires),fontWeight:daysN(h.ssl_expires)<=30?500:400}}>{fdate(h.ssl_expires)}</span></div>}
              {h.monthly_cost && <div className="info-row" style={{padding:'4px 0'}}><span className="info-label" style={{width:70}}>Kosten</span><span className="info-val" style={{fontFamily:'var(--mono-font)'}}>{money(h.monthly_cost)}/mnd</span></div>}
            </div>
            {h.hosting_username && (
              <div style={{marginTop:8,background:'var(--bg)',borderRadius:'var(--rsm)',padding:'8px 12px',fontSize:12}}>
                <div style={{color:'var(--text-muted)',marginBottom:4,fontWeight:600,fontSize:11,textTransform:'uppercase',letterSpacing:'.04em'}}>Inloggegevens</div>
                <div style={{display:'flex',gap:16}}>
                  {h.hosting_username && <span>Gebruiker: <strong>{h.hosting_username}</strong></span>}
                  {h.hosting_password && <span style={{marginLeft:12}}>Wachtwoord: <MaskedSecret value={h.hosting_password} /></span>}
                </div>
              </div>
            )}
            {h.notes && <div style={{marginTop:8,fontSize:12,color:'var(--text-muted)',fontStyle:'italic'}}>{h.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Hosting Modal ──────────────────────────────────────────────────────────────
const CMS_OPTIONS = ['WordPress','Webflow','Shopify','Wix','Squarespace','Framer','Joomla','Drupal','Custom','Anders']
const HOSTER_OPTIONS = ['Antagonist','Mijn.host','TransIP','Hostnet','WP Engine','Kinsta','SiteGround','Cloudways','Vercel','Netlify','Anders']

function HostingModal({ hosting, clients, defaultClientId, onSave, trigger }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const init = { client_id: defaultClientId||'', site_name:'', url:'', cms:'', hoster:'', hosting_login_url:'', hosting_username:'', hosting_password:'', domain:'', domain_expires:'', ssl_expires:'', monthly_cost:'', notes:'' }
  const [form, setForm] = useState(init)
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}))

  function openModal() {
    setForm(hosting ? {
      client_id: hosting.client_id||'',
      site_name: hosting.site_name||'',
      url: hosting.url||'',
      cms: hosting.cms||'',
      hoster: hosting.hoster||'',
      hosting_login_url: hosting.hosting_login_url||'',
      hosting_username: hosting.hosting_username||'',
      hosting_password: hosting.hosting_password||'',
      domain: hosting.domain||'',
      domain_expires: hosting.domain_expires||'',
      ssl_expires: hosting.ssl_expires||'',
      monthly_cost: hosting.monthly_cost||'',
      notes: hosting.notes||''
    } : {...init, client_id: defaultClientId||''})
    setShowPw(false)
    setOpen(true)
  }

  async function save() {
    if(!form.site_name.trim()) return showToast('Vul een sitenaam in.','error')
    setSaving(true)
    try {
      const data = {
        client_id: form.client_id || null,
        site_name: form.site_name.trim(),
        url: form.url || null,
        cms: form.cms || null,
        hoster: form.hoster || null,
        hosting_login_url: form.hosting_login_url || null,
        hosting_username: form.hosting_username || null,
        hosting_password: form.hosting_password || null,
        domain: form.domain || null,
        domain_expires: form.domain_expires || null,
        ssl_expires: form.ssl_expires || null,
        monthly_cost: form.monthly_cost ? parseFloat(form.monthly_cost) : null,
        notes: form.notes || null
      }
      if(hosting) await db.updateHosting(hosting.id, data)
      else await db.createHosting(data)
      setOpen(false); onSave()
    } catch(e) {
      showToast('Fout bij opslaan: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return <>
    {React.cloneElement(trigger, {onClick: openModal})}
    <Modal open={open} onClose={()=>setOpen(false)} title={hosting?'Site bewerken':'Site toevoegen'}>
      <FR>
        <FG label="Sitenaam"><input value={form.site_name} onChange={f('site_name')} placeholder="Bijv. Website Klant BV" autoFocus /></FG>
        <FG label="Klant"><select value={form.client_id} onChange={f('client_id')}><option value="">— Geen klant —</option>{(clients||[]).map(c=><option key={c.id} value={c.id}>{c.fname} {c.lname}{c.company?' ('+c.company+')':''}</option>)}</select></FG>
      </FR>
      <FG label="Website URL"><input value={form.url} onChange={f('url')} placeholder="https://" type="url" /></FG>
      <FR>
        <FG label="CMS">
          <select value={form.cms} onChange={f('cms')}>
            <option value="">— Kies CMS —</option>
            {CMS_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        </FG>
        <FG label="Hoster">
          <select value={form.hoster} onChange={f('hoster')}>
            <option value="">— Kies hoster —</option>
            {HOSTER_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        </FG>
      </FR>
      <FG label="Hostingpaneel URL"><input value={form.hosting_login_url} onChange={f('hosting_login_url')} placeholder="https://mijn.host/login" type="url" /></FG>
      <FR>
        <FG label="Gebruikersnaam hosting"><input value={form.hosting_username} onChange={f('hosting_username')} /></FG>
        <FG label="Wachtwoord hosting">
          <div style={{position:'relative'}}>
            <input type={showPw?'text':'password'} value={form.hosting_password} onChange={f('hosting_password')} style={{paddingRight:34}} autoComplete="new-password" />
            <button
              type="button"
              onClick={()=>setShowPw(s=>!s)}
              aria-label={showPw ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
              style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',color:'var(--text-faint)',padding:4,display:'flex'}}
            ><EyeIcon off={showPw} /></button>
          </div>
        </FG>
      </FR>
      <FR>
        <FG label="Domeinnaam"><input value={form.domain} onChange={f('domain')} placeholder="klant.nl" /></FG>
        <FG label="Maandelijkse kosten (€)"><input value={form.monthly_cost} onChange={f('monthly_cost')} type="number" step="0.01" min="0" /></FG>
      </FR>
      <FR>
        <FG label="Domein verloopt"><input value={form.domain_expires} onChange={f('domain_expires')} type="date" /></FG>
        <FG label="SSL verloopt"><input value={form.ssl_expires} onChange={f('ssl_expires')} type="date" /></FG>
      </FR>
      <FG label="Notities"><textarea value={form.notes} onChange={f('notes')} rows={2} placeholder="Extra info, bijzonderheden…" /></FG>
      <ModalActions onCancel={()=>setOpen(false)} onSave={save} saving={saving} />
    </Modal>
  </>
}

// ── Client Meetings Tab ────────────────────────────────────────────────────────
function ClientMeetingsTab({ client, onRefresh }) {
  const [meetings, setMeetings] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title:'', meeting_date:'', meeting_time:'', duration_minutes:60, type:'videocall', location:'', notes:'', status:'gepland', visible_to_client:true })
  const f = k => e => setForm(p => ({...p, [k]: e.target.value}))

  useEffect(() => { db.getMeetings(client.id).then(setMeetings) }, [client.id])
  const refresh = () => db.getMeetings(client.id).then(setMeetings)

  const buildCalendarUrl = m => buildMeetingCalendarUrl(m, client)

  async function saveMeeting() {
    if (!form.title.trim() || !form.meeting_date) return showToast('Vul een titel en datum in.','error')
    setSaving(true)
    try {
      await db.createMeeting({ client_id: client.id, ...form, duration_minutes: parseInt(form.duration_minutes) || 60 })
      setShowModal(false)
      setForm({ title:'', meeting_date:'', meeting_time:'', duration_minutes:60, type:'videocall', location:'', notes:'', status:'gepland', visible_to_client:true })
      refresh()
    } catch(e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  async function toggleStatus(m) {
    const newStatus = m.status === 'gepland' ? 'geweest' : 'gepland'
    await db.updateMeeting(m.id, { status: newStatus })
    refresh()
  }

  const upcoming = meetings.filter(m => m.status === 'gepland').sort((a,b) => a.meeting_date.localeCompare(b.meeting_date))
  const past = meetings.filter(m => m.status === 'geweest').sort((a,b) => b.meeting_date.localeCompare(a.meeting_date))

  return (
    <div>
      <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'flex-end'}}>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(true)}>+ Meeting</button>
      </div>
      <div className="sc-body">
        {!meetings.length ? (
          <div className="empty">Geen meetings gepland</div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div style={{marginBottom:18}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Gepland</div>
                {upcoming.map(m => <MeetingRow key={m.id} m={m} onToggle={() => toggleStatus(m)} onDelete={() => db.deleteMeeting(m.id).then(refresh)} calUrl={buildCalendarUrl(m)} />)}
              </div>
            )}
            {past.length > 0 && (
              <div>
                <div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Geweest</div>
                {past.map(m => <MeetingRow key={m.id} m={m} past onToggle={() => toggleStatus(m)} onDelete={() => db.deleteMeeting(m.id).then(refresh)} calUrl={buildCalendarUrl(m)} />)}
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <div className="modal-bg open" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h3>Meeting plannen</h3>
            <div className="form-group"><label>Titel</label><input value={form.title} onChange={f('title')} placeholder="Bijv. Kennismaking, Website bespreking…" autoFocus /></div>
            <div className="form-row">
              <div className="form-group"><label>Datum</label><input type="date" value={form.meeting_date} onChange={f('meeting_date')} /></div>
              <div className="form-group"><label>Tijd</label><input type="time" value={form.meeting_time} onChange={f('meeting_time')} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Duur (minuten)</label><input type="number" value={form.duration_minutes} onChange={f('duration_minutes')} min="15" step="15" /></div>
              <div className="form-group"><label>Type</label>
                <select value={form.type} onChange={f('type')}>
                  <option value="videocall">Videocall</option>
                  <option value="bel">Telefoongesprek</option>
                  <option value="locatie">Op locatie</option>
                  <option value="overig">Overig</option>
                </select>
              </div>
            </div>
            <div className="form-group"><label>Locatie / link</label><input value={form.location} onChange={f('location')} placeholder="Bijv. https://meet.google.com/… of adres" /></div>
            <div className="form-group"><label>Notities</label><textarea value={form.notes} onChange={f('notes')} rows={3} placeholder="Agendapunten, voorbereiding…" /></div>
            <ClientVisibleCheckbox checked={form.visible_to_client} onChange={v=>setForm(p=>({...p,visible_to_client:v}))} />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Annuleren</button>
              <button className="btn btn-primary" onClick={saveMeeting} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MeetingRow({ m, past, onToggle, onDelete, calUrl }) {
  const dd = daysN(m.meeting_date)
  const isToday = dd === 0
  const isTomorrow = dd === 1

  return (
    <div style={{
      display:'flex', alignItems:'flex-start', gap:12, padding:'12px 0',
      borderBottom:'1px solid var(--border)', opacity: past ? 0.65 : 1
    }}>
      <div style={{
        width:40, height:40, borderRadius:'var(--rsm)', flexShrink:0,
        background: isToday ? 'var(--accent)' : 'var(--bg2)',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        border:'1px solid var(--border)'
      }}>
        <div style={{fontSize:9,fontWeight:600,color: isToday ? '#fff' : 'var(--text-faint)',textTransform:'uppercase'}}>
          {new Date(m.meeting_date).toLocaleDateString('nl-NL',{month:'short'})}
        </div>
        <div style={{fontSize:16,fontWeight:700,color: isToday ? '#fff' : 'var(--text)',fontFamily:'var(--heading-font)',lineHeight:1}}>
          {new Date(m.meeting_date).getDate()}
        </div>
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontWeight:500,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
          <MeetingTypeIcon type={m.type} /> {m.title}
          {isToday && <span className="badge bg-green" style={{fontSize:10}}>Vandaag</span>}
          {isTomorrow && <span className="badge bg-amber" style={{fontSize:10}}>Morgen</span>}
          {!m.visible_to_client && <span style={{fontSize:10,color:'var(--text-faint)'}} title="Niet zichtbaar voor klant">(intern)</span>}
        </div>
        <div style={{fontSize:11,color:'var(--text-faint)',marginTop:2}}>
          {m.meeting_time ? m.meeting_time.slice(0,5) + ' · ' : ''}{m.duration_minutes} min
          {m.location ? ' · ' + m.location : ''}
        </div>
        {m.notes && <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4,lineHeight:1.5}}>{m.notes}</div>}
      </div>
      <div style={{display:'flex',gap:5,flexShrink:0,alignItems:'center'}}>
        {!past && (
          <a
            href={calUrl} target="_blank" rel="noreferrer"
            className="btn btn-ghost btn-xs"
            style={{textDecoration:'none',display:'inline-flex',alignItems:'center',gap:4}}
            title="Toevoegen aan Google Calendar"
          >Inplannen</a>
        )}
        <button
          className="btn btn-ghost btn-xs"
          onClick={onToggle}
          title={past ? 'Markeer als gepland' : 'Markeer als geweest'}
          aria-label={past ? 'Markeer als gepland' : 'Markeer als geweest'}
        >{past ? '↩' : '✓'}</button>
        <button
          className="btn btn-ghost btn-xs"
          style={{color:'var(--red-text)'}}
          onClick={() => confirm('Meeting verwijderen?') && onDelete()}
          aria-label="Verwijderen"
        >×</button>
      </div>
    </div>
  )
}
