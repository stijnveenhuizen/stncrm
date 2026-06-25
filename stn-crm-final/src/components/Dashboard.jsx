import React, { useState, useEffect, useCallback, useRef } from 'react'
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

function ChevronIcon({ size = 12 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
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

function SkeletonScreen() {
  const bar = (w, h=14) => <div style={{width:w,height:h,borderRadius:6,background:'var(--bg2)',animation:'skeleton-pulse 1.4s ease-in-out infinite'}} />
  return (
    <div className="app">
      <style>{`@keyframes skeleton-pulse{0%,100%{opacity:.6}50%{opacity:1}}`}</style>
      <header className="topbar-dark" style={{display:'flex',alignItems:'center',gap:16,padding:'0 16px'}}>{bar(90,18)}</header>
      <div style={{display:'flex'}}>
        <nav style={{width:252,padding:16,display:'flex',flexDirection:'column',gap:10,position:'fixed',top:52,bottom:0,background:'var(--surface)',borderRight:'1px solid var(--border)'}}>
          {bar(140,22)}{bar(100)}
          <div style={{height:8}} />
          {[1,2,3,4].map(i => bar('100%')) }
        </nav>
        <div style={{marginLeft:252,paddingTop:52,padding:24,flex:1}}>
          <div style={{display:'flex',gap:16,marginBottom:20}}>
            {[1,2,3,4].map(i => <div key={i} style={{flex:1,padding:16,borderRadius:'var(--r)',border:'1px solid var(--border)'}}>{bar(60,11)}<div style={{height:8}} />{bar(80,22)}</div>)}
          </div>
          {bar('100%',180)}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({ session, isPlatformAdmin, onOpenAdminPanel }) {
  const [view, setView] = useState('overview')
  const [profile, setProfile] = useState(null)
  const [myOrganizations, setMyOrganizations] = useState([])
  const [activeOrgId, setActiveOrgId] = useState(null)
  const [orgsLoaded, setOrgsLoaded] = useState(false)
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
  const [orgMembers, setOrgMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [orgMenuOpen, setOrgMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [showNewWorkspace, setShowNewWorkspace] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [companySettings, setCompanySettings] = useState(null)
  const [readNotifKeys, setReadNotifKeys] = useState([])
  const [notifMenuOpen, setNotifMenuOpen] = useState(false)
  const [cmdKOpen, setCmdKOpen] = useState(false)
  const [cmdKQuery, setCmdKQuery] = useState('')

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdKOpen(o => !o)
        setCmdKQuery('')
      }
      if (e.key === 'Escape') setCmdKOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function applyProfileTheme(p) {
    if (p.theme) setDarkMode(p.theme === 'dark')
    if (p.accent_color) {
      document.documentElement.style.setProperty('--accent', p.accent_color)
      document.documentElement.style.setProperty('--accent-hover', p.accent_color + 'dd')
      document.documentElement.style.setProperty('--accent-soft', p.accent_color + '18')
      document.documentElement.style.setProperty('--accent-text', p.accent_color)
    }
  }

  const loadAll = useCallback(async () => {
    if (!activeOrgId) return
    try {
      const [c, p, i, r, t, h, m, pl] = await Promise.all([
        db.getClients(activeOrgId), db.getProjects(activeOrgId), db.getAllInvoices(activeOrgId), db.getAllRecurring(activeOrgId),
        db.getAllTasks(activeOrgId), db.getAllHosting(activeOrgId), db.getAllMeetings(activeOrgId), db.getPipeline(activeOrgId)
      ])
      setClients(c); setProjects(p); setAllInvoices(i); setAllRecurring(r); setAllHosting(h); setAllMeetings(m); setPipeline(pl)
      setAllTasks(t.map(task => ({ ...task, project: task.projects })))
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [activeOrgId])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { db.getProfile(session.user.id).then(p => { if(p) { setProfile(p); applyProfileTheme(p) } }) }, [session.user.id])

  const loadOrganizations = useCallback(() => {
    db.getMyOrganizations().then(orgs => {
      setMyOrganizations(orgs)
      setOrgsLoaded(true)
      setActiveOrgId(prev => {
        if (prev && orgs.some(o => o.id === prev)) return prev
        let stored
        try { stored = localStorage.getItem('stn_active_org') } catch(e) {}
        if (stored && orgs.some(o => o.id === stored)) return stored
        return orgs[0]?.id || null
      })
    }).catch(() => setOrgsLoaded(true))
  }, [])
  useEffect(() => { loadOrganizations() }, [loadOrganizations])

  function switchOrg(orgId) {
    setActiveOrgId(orgId)
    try { localStorage.setItem('stn_active_org', orgId) } catch(e) {}
    setView('overview')
    setOrgMenuOpen(false)
  }

  const loadMembers = useCallback(() => {
    if (!activeOrgId) return
    db.getOrgMembers(activeOrgId).then(setOrgMembers).catch(() => {})
  }, [activeOrgId])
  useEffect(() => { loadMembers() }, [loadMembers])

  const loadCompanySettings = useCallback(() => {
    if (!activeOrgId) return
    db.getCompanySettings(activeOrgId).then(setCompanySettings).catch(() => setCompanySettings(null))
  }, [activeOrgId])
  useEffect(() => { loadCompanySettings() }, [loadCompanySettings])

  useEffect(() => { db.getReadNotificationKeys().then(setReadNotifKeys).catch(() => {}) }, [])

  const notifications = (() => {
    const items = []
    allHosting.forEach(h => {
      const dd = h.domain_expires ? daysN(h.domain_expires) : null
      if (dd !== null && dd <= 30) items.push({ key: `domain-${h.id}`, text: `Domein ${h.domain || h.site_name || ''} verloopt ${dd<0?'is verlopen':dd===0?'vandaag':`over ${dd}d`}`, severity: dd<14?'red':'amber', date: h.domain_expires, view: 'hosting' })
      const sd = h.ssl_expires ? daysN(h.ssl_expires) : null
      if (sd !== null && sd <= 30) items.push({ key: `ssl-${h.id}`, text: `SSL van ${h.site_name || h.domain || ''} verloopt ${sd<0?'is verlopen':sd===0?'vandaag':`over ${sd}d`}`, severity: sd<14?'red':'amber', date: h.ssl_expires, view: 'hosting' })
    })
    allInvoices.forEach(i => {
      if (i.status !== 'betaald' && i.due_date && daysN(i.due_date) < 0) {
        items.push({ key: `invoice-${i.id}`, text: `Factuur ${i.invoice_number || i.description} is over de vervaldatum`, severity: 'red', date: i.due_date, view: 'finance' })
      }
    })
    allTasks.forEach(t => {
      if (!t.done && t.due_date && daysN(t.due_date) < 0) {
        items.push({ key: `task-${t.id}`, text: `Taak "${t.description}" is over de deadline`, severity: 'red', date: t.due_date, view: 'tasks' })
      }
    })
    return items.sort((a,b) => (a.date||'').localeCompare(b.date||''))
  })()
  const unreadNotifications = notifications.filter(n => !readNotifKeys.includes(n.key))

  async function markNotifRead(key) {
    if (readNotifKeys.includes(key)) return
    setReadNotifKeys(k => [...k, key])
    try { await db.markNotificationRead(key) } catch(e) {}
  }

  const orgName = myOrganizations.find(o => o.id === activeOrgId)?.name || ''
  const myRole = myOrganizations.find(o => o.id === activeOrgId)?.myRole

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

  if (!orgsLoaded) return <SkeletonScreen />

  const curClient = clients.find(c => c.id === curClientId)
  const curProject = projects.find(p => p.id === curProjectId)
  const clientName = id => { const c = clients.find(c => c.id === id); return c ? c.fname + ' ' + c.lname : '' }
  const totalPaid = allInvoices.filter(i => i.status === 'betaald').reduce((s,i) => s + Number(i.amount), 0)
  const totalOpen = allInvoices.filter(i => ['verzonden','te laat'].includes(i.status)).reduce((s,i) => s + Number(i.amount), 0)
  const totalMRR = db.calcMRR(allRecurring)

  const CSS = `
    .app{min-height:100vh;transition:background .2s}
    .main{margin-left:252px;padding-top:52px;min-height:100vh}

    /* ── Donkere topbar (merk + workspace-switcher + profiel) ─────────────── */
    .topbar-dark{position:fixed;top:0;left:0;right:0;height:52px;background:#0e0e10;color:#fff;display:flex;align-items:center;padding:0 16px;gap:10px;z-index:60}
    .topbar-dark-logo{display:flex;align-items:center;gap:8px;flex-shrink:0;padding-right:8px;border-right:1px solid rgba(255,255,255,.12);margin-right:4px}
    .topbar-dark-logo-icon{width:26px;height:26px;border-radius:7px;background:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .topbar-dark-logo-icon span{color:#fff;font-size:12px;font-family:var(--heading-font);font-weight:700}
    .topbar-dark-logo b{font-size:12.5px;font-weight:700;letter-spacing:.06em;white-space:nowrap}
    .org-switcher{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;cursor:pointer;background:rgba(255,255,255,.06);position:relative;max-width:240px}
    .org-switcher:hover{background:rgba(255,255,255,.13)}
    .org-switcher-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .org-switcher .chev{color:rgba(255,255,255,.5);flex-shrink:0}
    .org-menu,.profile-menu{position:absolute;top:calc(100% + 8px);background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 12px 28px rgba(0,0,0,.22);min-width:230px;max-height:360px;overflow-y:auto;z-index:80;padding:6px}
    .org-menu{left:0}
    .profile-menu{right:0;min-width:210px}
    .menu-item{padding:8px 10px;border-radius:6px;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px;color:var(--text)}
    .menu-item:hover{background:var(--accent-soft);color:var(--accent-text)}
    .menu-sep{height:1px;background:var(--border);margin:6px 2px}
    .hamburger-btn{display:none;width:32px;height:32px;border-radius:8px;background:none;border:none;cursor:pointer;align-items:center;justify-content:center;color:#fff;flex-shrink:0}
    .hamburger-btn:hover{background:rgba(255,255,255,.12)}
    .topbar-dark-right{margin-left:auto;display:flex;align-items:center;gap:6px;flex-shrink:0}
    .topbar-dark-icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);cursor:pointer;position:relative;background:none;border:none;flex-shrink:0}
    .topbar-dark-icon:hover{background:rgba(255,255,255,.12);color:#fff}
    .profile-trigger{display:flex;align-items:center;cursor:pointer;padding:2px;border-radius:50%;position:relative;flex-shrink:0}
    .profile-trigger:hover{box-shadow:0 0 0 2px rgba(255,255,255,.25)}

    /* ── Linker sidebar ─────────────────────────────────────────────────── */
    .sidebar2{position:fixed;top:52px;left:0;bottom:0;width:252px;background:var(--surface);border-right:1px solid var(--border);overflow-y:auto;padding:18px 12px;z-index:40;transition:background .2s,border .2s}
    .sidebar2-org{padding:2px 8px 14px}
    .sidebar2-org h2{font-size:16px;font-weight:700;font-family:var(--heading-font);letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sidebar2-org-role{font-size:12px;color:var(--text-muted);margin-top:2px}
    .sidebar2-role-badge{display:inline-flex;align-items:center;gap:4px;margin-top:9px;padding:3px 10px;border-radius:6px;background:var(--accent-soft);color:var(--accent-text);font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
    .sidebar2-section{margin:6px 0;padding-top:10px;border-top:1px solid var(--border)}
    .sidebar2-section:first-of-type{border-top:none;padding-top:0}
    .sidebar2-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border-radius:8px;font-size:13.5px;color:var(--text);cursor:pointer;margin-bottom:1px;border:none;background:none;width:100%;text-align:left}
    .sidebar2-item:hover{background:var(--bg2)}
    .sidebar2-item.active{background:var(--accent-soft);color:var(--accent-text);font-weight:600}
    .sidebar2-item .chev{color:var(--text-faint);font-size:11px}

    /* ── Paginakop + toolbar (gedeeld patroon voor elke view) ───────────── */
    .topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:22px 28px 18px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;transition:background .2s,border .2s}
    .topbar h2{font-size:26px;font-weight:800;letter-spacing:-.02em;font-family:var(--heading-font)}
    .topbar p.page-sub{font-size:13px;color:var(--text-muted);margin-top:6px}
    .topbar-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
    .page-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 28px;border-bottom:1px solid var(--border);background:var(--surface)}
    .page-toolbar .grow{flex:1}
    .view-toggle{display:flex;border:1px solid var(--border-strong);border-radius:8px;overflow:hidden;flex-shrink:0}
    .view-toggle button{padding:7px 10px;background:var(--surface);border:none;cursor:pointer;color:var(--text-muted);display:flex;align-items:center}
    .view-toggle button.active{background:var(--accent-soft);color:var(--accent-text)}
    .folder-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;padding:18px 28px 4px}
    .folder-card{display:flex;align-items:center;gap:10px;padding:13px 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);cursor:pointer;transition:border-color .15s,background .15s}
    .folder-card:hover{border-color:var(--accent);background:var(--accent-soft)}
    .folder-card-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff}
    .folder-card-name{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .folder-card-count{font-size:11px;color:var(--text-faint)}
    .item-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px;padding:18px 28px 28px}
    .item-card{border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--surface);transition:box-shadow .15s,border-color .15s;cursor:pointer;display:flex;flex-direction:column}
    .item-card:hover{border-color:var(--accent);box-shadow:var(--shadow-md)}
    .item-card-thumb{height:96px;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0}
    .item-card-body{padding:12px 14px;flex:1}
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
    .stat-card-icon{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:#fff;margin-bottom:10px}
    .stat-label{font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px}
    .stat-value{font-size:22px;font-weight:700;letter-spacing:-.03em;font-family:var(--heading-font)}
    .stat-sub{font-size:11px;color:var(--text-faint);margin-top:3px}
    .sc{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);margin-bottom:16px;overflow:hidden;box-shadow:var(--shadow);transition:background .2s,border .2s}
    .sc-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)}
    .sc-title{font-size:13px;font-weight:600;font-family:var(--heading-font);display:flex;align-items:center;gap:8px}
    .sc-body{padding:16px 18px}
    .cl-header{display:grid;grid-template-columns:2fr 1.2fr 0.8fr 1fr 1fr 100px;padding:9px 20px;background:var(--bg2);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em}
    .cl-header .sortable{cursor:pointer;user-select:none;display:flex;align-items:center;gap:3px}
    .cl-header .sortable:hover{color:var(--accent-text)}
    .cl-row{display:grid;grid-template-columns:2fr 1.2fr 0.8fr 1fr 1fr 100px;padding:13px 20px;border-bottom:1px solid var(--border);align-items:center;cursor:pointer;transition:background .1s}
    .cl-row:last-child{border-bottom:none}.cl-row:hover{background:var(--accent-soft)}
    .pl-header{display:grid;grid-template-columns:2fr 1.4fr 1fr 0.8fr 120px;padding:9px 20px;background:var(--bg2);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em}
    .pl-row{display:grid;grid-template-columns:2fr 1.4fr 1fr 0.8fr 120px;padding:13px 20px;border-bottom:1px solid var(--border);align-items:center;cursor:pointer;transition:background .1s}
    .pl-row:last-child{border-bottom:none}.pl-row:hover{background:var(--accent-soft)}
    .fin-header{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 110px;padding:8px 18px;background:var(--bg);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}
    .fin-row{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 110px;gap:10px;align-items:center;padding:11px 18px;border-bottom:1px solid var(--border);font-size:13px;transition:background .1s}
    .fin-row:last-child{border-bottom:none}.fin-row:hover{background:var(--accent-soft)}
    .host-header{display:grid;grid-template-columns:2fr 1.2fr 1fr 1fr 1fr 120px;padding:8px 18px;background:var(--bg);border-bottom:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}
    .host-row{display:grid;grid-template-columns:2fr 1.2fr 1fr 1fr 1fr 120px;padding:12px 18px;border-bottom:1px solid var(--border);align-items:center;font-size:13px;transition:background .1s}
    .host-row:last-child{border-bottom:none}.host-row:hover{background:var(--accent-soft)}
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

    @media(max-width:1024px){
      .stats-grid{grid-template-columns:repeat(2,1fr)}
      .detail-grid{grid-template-columns:1fr}
      .modal{width:90vw;max-width:520px}
    }
    
    @media(max-width:768px){
      .hamburger-btn{display:flex}
      .sidebar2{transform:translateX(-100%);transition:transform .25s ease;box-shadow:0 0 0 0 transparent}
      .sidebar2.open{transform:translateX(0);box-shadow:8px 0 24px rgba(0,0,0,.18)}
      .sidebar-overlay{display:none;position:fixed;inset:0;top:52px;background:rgba(0,0,0,.45);z-index:39}
      .sidebar-overlay.open{display:block}
      .main{margin-left:0}
      .topbar-dark-logo b{display:none}
      .org-switcher{max-width:140px}
      .detail-grid{grid-template-columns:1fr}
      .stats-grid{grid-template-columns:1fr 1fr;gap:12px}
      .stat-card{padding:14px 16px}
      .stat-value{font-size:18px}
      .content{padding:16px}
      .topbar{padding:16px 14px;flex-wrap:wrap}
      .topbar h2{font-size:19px}
      .topbar-right{gap:6px}
      .page-toolbar,.folder-grid,.item-card-grid{padding-left:14px;padding-right:14px}
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
    }
  `

  if (!myOrganizations.length) return (
    <ToastProvider>
      <style>{CSS}</style>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:14}}>
        <div style={{fontSize:15,fontWeight:600}}>Je hebt nog geen bedrijf</div>
        <div style={{fontSize:13,color:'var(--text-muted)'}}>Maak een bedrijf aan om klanten en projecten te beheren.</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNewWorkspace(true)}>+ Bedrijf aanmaken</button>
        <button className="btn btn-ghost btn-xs" onClick={logout}>Uitloggen</button>
        <NewWorkspaceModal open={showNewWorkspace} onClose={() => setShowNewWorkspace(false)} onCreated={orgId => { loadOrganizations(); switchOrg(orgId) }} />
      </div>
    </ToastProvider>
  )

  if (loading) return <SkeletonScreen />

  const navItem = (key, label, activeWhen) => (
    <button className={`sidebar2-item${activeWhen?' active':''}`} onClick={() => { showView(key); setSidebarOpen(false) }}>{label}</button>
  )

  return (
    <ToastProvider>
    <div className="app">
      <style>{CSS}</style>
      <header className="topbar-dark">
        <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Menu openen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div className="topbar-dark-logo">
          <div className="topbar-dark-logo-icon"><span>S</span></div>
          <b>STN CRM</b>
        </div>
        {myOrganizations.length > 1 ? (
          <div className="org-switcher" onClick={() => { setOrgMenuOpen(o => !o); setProfileMenuOpen(false) }} onMouseLeave={() => setOrgMenuOpen(false)}>
            <span className="org-switcher-name">{orgName || 'Bedrijf'}</span>
            <span className="chev"><ChevronIcon/></span>
            {orgMenuOpen && (
              <div className="org-menu">
                <div style={{fontSize:10,fontWeight:600,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.06em',padding:'6px 10px 4px'}}>Bedrijven</div>
                {myOrganizations.filter(o => isPlatformAdmin || (o.name && o.name.trim())).map(o => (
                  <div key={o.id} className="menu-item" style={{justifyContent:'space-between'}} onClick={() => switchOrg(o.id)}>
                    <span>{o.name}</span>
                    {o.id === activeOrgId && <span style={{color:'var(--accent-text)'}}>✓</span>}
                  </div>
                ))}
                <div className="menu-sep"></div>
                {clients.filter(c => isPlatformAdmin || (c.fname && c.fname.trim() && c.lname && c.lname.trim())).map(c => (
                  <div key={c.id} className="menu-item" onClick={() => { showView('client-detail', c.id); setOrgMenuOpen(false) }}>
                    <span className={`avatar ${avC(c.id)}`} style={{width:22,height:22,fontSize:9,flexShrink:0}}>{ini(c)}</span>
                    {c.fname} {c.lname}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="org-switcher-name" style={{padding:'6px 10px',color:'rgba(255,255,255,.85)',fontSize:13,fontWeight:500}}>{orgName || 'Bedrijf'}</div>
        )}
        <div className="topbar-dark-right" onMouseLeave={() => setProfileMenuOpen(false)}>
          <div className="profile-trigger" onMouseLeave={() => setNotifMenuOpen(false)}>
            <button className="topbar-dark-icon" aria-label="Meldingen" title="Meldingen" style={{position:'relative'}} onClick={() => { setNotifMenuOpen(o => !o); setOrgMenuOpen(false); setProfileMenuOpen(false) }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              {unreadNotifications.length > 0 && <span style={{position:'absolute',top:2,right:2,background:'var(--red)',color:'#fff',borderRadius:99,fontSize:9,fontWeight:700,minWidth:14,height:14,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 3px'}}>{unreadNotifications.length}</span>}
            </button>
            {notifMenuOpen && (
              <div className="profile-menu" style={{width:320,right:0}}>
                <div style={{padding:'8px 10px',marginBottom:4,borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:13,fontWeight:600}}>Meldingen</span>
                  {unreadNotifications.length > 0 && <span style={{fontSize:11,color:'var(--text-faint)'}}>{unreadNotifications.length} ongelezen</span>}
                </div>
                {!notifications.length ? (
                  <div style={{padding:'16px 10px',fontSize:12,color:'var(--text-faint)',textAlign:'center'}}>Geen meldingen</div>
                ) : notifications.slice(0,20).map(n => {
                  const isRead = readNotifKeys.includes(n.key)
                  return (
                    <div key={n.key} className="menu-item" style={{alignItems:'flex-start',gap:8,opacity:isRead?0.55:1}}
                      onClick={() => { markNotifRead(n.key); showView(n.view); setNotifMenuOpen(false) }}
                    >
                      <span style={{width:7,height:7,borderRadius:'50%',marginTop:5,flexShrink:0,background:n.severity==='red'?'var(--red)':'var(--amber)'}}></span>
                      <span style={{fontSize:12,lineHeight:1.4}}>{n.text}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="profile-trigger" onClick={() => { setProfileMenuOpen(o => !o); setOrgMenuOpen(false); setNotifMenuOpen(false) }}>
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
            {profileMenuOpen && (
              <div className="profile-menu">
                <div style={{padding:'8px 10px',marginBottom:4,borderBottom:'1px solid var(--border)'}}>
                  <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{profile?.full_name || 'Profiel'}</div>
                  <div style={{fontSize:11,color:'var(--text-faint)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{session.user.email}</div>
                </div>
                <div className="menu-item" onClick={() => { showView('profile'); setProfileMenuOpen(false) }}>Profiel</div>
                {isPlatformAdmin && <div className="menu-item" onClick={() => { setProfileMenuOpen(false); onOpenAdminPanel() }}>Platform-admin</div>}
                <div className="menu-item" style={{justifyContent:'space-between',cursor:'default'}}>
                  <span>Donker thema</span>
                  <button className={darkMode ? 'theme-toggle dark' : 'theme-toggle'} onClick={() => setDarkMode(!darkMode)} title={darkMode ? 'Licht thema' : 'Donker thema'}>
                    <div className="theme-toggle-knob"></div>
                  </button>
                </div>
                <div className="menu-sep"></div>
                <div className="menu-item" onClick={logout} style={{color:'var(--red-text)'}}>Uitloggen</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)}></div>
      <nav className={`sidebar2${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar2-org" style={myRole==='owner' ? {cursor:'pointer'} : {}} onClick={() => myRole==='owner' && showView('company-settings')} title={myRole==='owner' ? 'Bedrijfsinstellingen' : undefined}>
          {companySettings?.logo_url
            ? <img src={companySettings.logo_url} alt={orgName} style={{maxHeight:28,maxWidth:'100%',objectFit:'contain',marginBottom:4}} />
            : <h2>{orgName || 'Bedrijf'}</h2>
          }
          <div className="sidebar2-org-role">{profile?.full_name || session.user.email}</div>
          <span className="sidebar2-role-badge">{myRole === 'owner' ? 'Eigenaar' : 'Teamlid'}</span>
        </div>
        <div className="sidebar2-section">
          {navItem('overview', 'Dashboard', view==='overview')}
          {navItem('clients', 'Klanten', ['clients','client-detail'].includes(view))}
          {navItem('projects', 'Projecten', ['projects','project-detail'].includes(view))}
          {navItem('tasks', 'Taken', view==='tasks')}
        </div>
        <div className="sidebar2-section">
          {navItem('pipeline', 'Pipeline', view==='pipeline')}
          {navItem('finance', 'Financiën', view==='finance')}
          {navItem('hosting', 'Hosting', view==='hosting')}
        </div>
        <div className="sidebar2-section">
          {myRole === 'owner' && navItem('team', 'Team', view==='team')}
          {navItem('profile', 'Profiel', view==='profile')}
        </div>
      </nav>
      <div className="main">
        {view==='overview' && <OverviewView clients={clients} projects={projects} allTasks={allTasks} allInvoices={allInvoices} allRecurring={allRecurring} allMeetings={allMeetings} allHosting={allHosting} pipeline={pipeline} totalPaid={totalPaid} totalOpen={totalOpen} totalMRR={totalMRR} showView={showView} onRefresh={loadAll} myProfile={profile} myRole={myRole} activeOrgId={activeOrgId} orgMembers={orgMembers} />}
        {view==='clients' && <ClientsView clients={clients} projects={projects} allTasks={allTasks} allInvoices={allInvoices} showView={showView} onRefresh={loadAll} activeOrgId={activeOrgId} />}
        {view==='client-detail' && curClient && <ClientDetailView client={curClient} projects={projects} allTasks={allTasks} allHosting={allHosting} allMeetings={allMeetings} showView={showView} onRefresh={loadAll} activeOrgId={activeOrgId} currentUserName={profile?.full_name || session.user.email} />}
        {view==='projects' && <ProjectsView projects={projects} clients={clients} clientName={clientName} allTasks={allTasks} showView={showView} onRefresh={loadAll} activeOrgId={activeOrgId} />}
        {view==='project-detail' && curProject && <ProjectDetailView project={curProject} clients={clients} clientName={clientName} showView={showView} onRefresh={loadAll} orgMembers={orgMembers} myRole={myRole} currentUserId={session.user.id} currentUserName={profile?.full_name || session.user.email} />}
        {view==='tasks' && <TasksView allTasks={allTasks} showView={showView} onRefresh={loadAll} />}
        {view==='finance' && <FinanceView allInvoices={allInvoices} allRecurring={allRecurring} totalPaid={totalPaid} totalOpen={totalOpen} totalMRR={totalMRR} showView={showView} clients={clients} onRefresh={loadAll} />}
        {view==='hosting' && <HostingView allHosting={allHosting} clients={clients} showView={showView} onRefresh={loadAll} />}
        {view==='profile' && <ProfileView session={session} onProfileUpdate={p => { setProfile(p); applyProfileTheme(p) }} />}
        {view==='pipeline' && <PipelineView showView={showView} onRefresh={loadAll} organizationId={activeOrgId} />}
        {view==='team' && myRole === 'owner' && <TeamView members={orgMembers} onRefresh={loadMembers} myProfile={profile} activeOrgId={activeOrgId} />}
        {view==='company-settings' && myRole === 'owner' && <CompanySettingsView activeOrgId={activeOrgId} orgName={orgName} settings={companySettings} onRefresh={() => { loadCompanySettings(); loadOrganizations() }} onAddWorkspace={() => setShowNewWorkspace(true)} />}
      </div>
      <NewWorkspaceModal
        open={showNewWorkspace}
        onClose={() => setShowNewWorkspace(false)}
        onCreated={orgId => { loadOrganizations(); switchOrg(orgId) }}
      />
      {cmdKOpen && (
        <div className="modal-bg open" style={{alignItems:'flex-start',paddingTop:'12vh'}} onClick={e => e.target === e.currentTarget && setCmdKOpen(false)}>
          <div className="modal" style={{maxWidth:520,padding:0,overflow:'hidden'}}>
            <input
              autoFocus value={cmdKQuery} onChange={e => setCmdKQuery(e.target.value)}
              placeholder="Zoek klanten, projecten, taken…"
              style={{border:'none',borderBottom:'1px solid var(--border)',borderRadius:0,fontSize:15,padding:'16px 18px'}}
            />
            <div style={{maxHeight:360,overflowY:'auto',padding:6}}>
              {(() => {
                const q = cmdKQuery.trim().toLowerCase()
                if (!q) return <div style={{padding:'14px 12px',fontSize:12,color:'var(--text-faint)'}}>Typ om te zoeken…</div>
                const cR = clients.filter(c => `${c.fname} ${c.lname} ${c.company||''}`.toLowerCase().includes(q)).slice(0,6)
                const pR = projects.filter(p => p.name.toLowerCase().includes(q)).slice(0,6)
                const tR = allTasks.filter(t => t.description.toLowerCase().includes(q)).slice(0,6)
                if (!cR.length && !pR.length && !tR.length) return <div style={{padding:'14px 12px',fontSize:12,color:'var(--text-faint)'}}>Niets gevonden</div>
                return (
                  <>
                    {cR.length > 0 && <div style={{fontSize:10,fontWeight:600,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.06em',padding:'8px 10px 2px'}}>Klanten</div>}
                    {cR.map(c => <div key={c.id} className="menu-item" onClick={() => { showView('client-detail', c.id); setCmdKOpen(false) }}>{c.fname} {c.lname}{c.company?' · '+c.company:''}</div>)}
                    {pR.length > 0 && <div style={{fontSize:10,fontWeight:600,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.06em',padding:'8px 10px 2px'}}>Projecten</div>}
                    {pR.map(p => <div key={p.id} className="menu-item" onClick={() => { showView('project-detail', p.id); setCmdKOpen(false) }}>{p.name}</div>)}
                    {tR.length > 0 && <div style={{fontSize:10,fontWeight:600,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.06em',padding:'8px 10px 2px'}}>Taken</div>}
                    {tR.map(t => <div key={t.id} className="menu-item" onClick={() => { showView('tasks'); setCmdKOpen(false) }}>{t.description}</div>)}
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
    </ToastProvider>
  )
}

function OnboardingChecklist({ clients, projects, orgMembers, showView, onRefresh, activeOrgId, onDismiss }) {
  const steps = [
    { done: orgMembers.length > 1, label: "Nodig collega's uit", action: <button className="btn btn-ghost btn-xs" onClick={()=>showView('team')}>Naar Team</button> },
    { done: clients.length > 0, label: 'Voeg je eerste klant toe', action: <ClientModal onSave={onRefresh} activeOrgId={activeOrgId} trigger={<button className="btn btn-ghost btn-xs">Klant toevoegen</button>} /> },
    { done: projects.length > 0, label: 'Maak je eerste project aan', action: <ProjectModal clients={clients} onSave={onRefresh} activeOrgId={activeOrgId} trigger={<button className="btn btn-ghost btn-xs">Project aanmaken</button>} /> },
  ]
  return (
    <div className="sc" style={{marginBottom:16}}>
      <div className="sc-head">
        <span className="sc-title">Aan de slag</span>
        <button className="btn btn-ghost btn-xs" onClick={onDismiss}>Sluiten</button>
      </div>
      <div className="sc-body">
        {steps.map((s,i) => (
          <div key={i} className="info-row" style={{alignItems:'center'}}>
            <div style={{width:18,height:18,borderRadius:'50%',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:s.done?'var(--accent)':'var(--bg2)',border:s.done?'none':'1.5px solid var(--border-strong)'}}>
              {s.done && <span style={{color:'#fff',fontSize:10}}>✓</span>}
            </div>
            <span className="info-val" style={{textDecoration:s.done?'line-through':'none',color:s.done?'var(--text-faint)':'var(--text)'}}>{s.label}</span>
            {!s.done && s.action}
          </div>
        ))}
        <div style={{fontSize:11,color:'var(--text-faint)',marginTop:10}}>
          Tip: zodra je een project hebt, kun je daar vanuit ook je klant uitnodigen voor het klantportaal.
        </div>
      </div>
    </div>
  )
}

function TrendBadge({ value, format }) {
  if (!value) return null
  const up = value > 0
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:11,fontWeight:600,color: up?'var(--green-text)':'var(--red-text)',marginLeft:6}}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{transform: up?'none':'rotate(180deg)'}}><polyline points="18 15 12 9 6 15"/></svg>
      {up?'+':''}{format ? format(value) : value}
    </span>
  )
}

function OverviewView({ clients, projects, allTasks, allInvoices, allRecurring, allMeetings, allHosting = [], pipeline = [], totalPaid, totalOpen, totalMRR, showView, onRefresh, myProfile, myRole, activeOrgId, orgMembers = [] }) {
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try { return localStorage.getItem('stn_onboarding_dismissed_' + activeOrgId) === '1' } catch(e) { return false }
  })
  const showOnboarding = !onboardingDismissed && (clients.length === 0 || projects.length === 0 || orgMembers.length <= 1)
  function dismissOnboarding() {
    try { localStorage.setItem('stn_onboarding_dismissed_' + activeOrgId, '1') } catch(e) {}
    setOnboardingDismissed(true)
  }
  const openTasks = allTasks.filter(t => !t.done)
  const pDL = projects.filter(p => p.deadline && p.status !== 'afgerond').map(p => ({ name: p.name, deadline: p.deadline, sub: 'Project', tv: 'project-detail', tid: p.id, color: p.color }))
  const tDL = allTasks.filter(t => !t.done && t.due_date).map(t => ({ name: t.description, deadline: t.due_date, sub: t.project?.name || '', tv: 'project-detail', tid: t.project_id, color: t.project?.color || '#888' }))
  const deadlines = [...pDL, ...tDL].sort((a,b) => a.deadline.localeCompare(b.deadline)).slice(0,6)
  const activeRec = allRecurring.filter(r => r.status === 'actief')
  const openLeads = pipeline.filter(p => !['klant','afgewezen'].includes(p.stage))
  const expiringHosting = allHosting.filter(h => (h.domain_expires && daysN(h.domain_expires) <= 60) || (h.ssl_expires && daysN(h.ssl_expires) <= 60))

  const [period, setPeriod] = useState('all')
  function periodRange(p) {
    const now = new Date()
    if (p === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start, prevStart: new Date(now.getFullYear(), now.getMonth()-1, 1), prevEnd: start }
    }
    if (p === 'quarter') {
      const q = Math.floor(now.getMonth()/3)
      const start = new Date(now.getFullYear(), q*3, 1)
      return { start, prevStart: new Date(now.getFullYear(), q*3-3, 1), prevEnd: start }
    }
    if (p === 'year') {
      const start = new Date(now.getFullYear(), 0, 1)
      return { start, prevStart: new Date(now.getFullYear()-1, 0, 1), prevEnd: start }
    }
    return null
  }
  const range = periodRange(period)
  const trendRange = range || periodRange('month')

  const clientsInPeriod = range ? clients.filter(c => c.created_at && new Date(c.created_at) >= range.start) : clients
  const clientsPrev = clients.filter(c => c.created_at && new Date(c.created_at) >= trendRange.prevStart && new Date(c.created_at) < trendRange.prevEnd).length
  const clientsCur = clients.filter(c => c.created_at && new Date(c.created_at) >= trendRange.start).length

  const projectsInPeriod = range ? projects.filter(p => p.created_at && new Date(p.created_at) >= range.start) : projects
  const projectsPrev = projects.filter(p => p.created_at && new Date(p.created_at) >= trendRange.prevStart && new Date(p.created_at) < trendRange.prevEnd).length
  const projectsCur = projects.filter(p => p.created_at && new Date(p.created_at) >= trendRange.start).length

  const paidInPeriod = (range ? allInvoices.filter(i => i.status==='betaald' && i.date && new Date(i.date) >= range.start) : allInvoices.filter(i => i.status==='betaald')).reduce((s,i)=>s+Number(i.amount),0)
  const paidPrev = allInvoices.filter(i => i.status==='betaald' && i.date && new Date(i.date) >= trendRange.prevStart && new Date(i.date) < trendRange.prevEnd).reduce((s,i)=>s+Number(i.amount),0)
  const paidCur = allInvoices.filter(i => i.status==='betaald' && i.date && new Date(i.date) >= trendRange.start).reduce((s,i)=>s+Number(i.amount),0)

  const newRecurringInPeriod = allRecurring.filter(r => r.created_at && new Date(r.created_at) >= trendRange.start && r.status==='actief').length
  const revByClient = clients.map(c => ({ name: (c.company || c.fname+' '+c.lname).slice(0,14), v: allInvoices.filter(i => i.client_id===c.id && i.status==='betaald' && (!range || (i.date && new Date(i.date) >= range.start))).reduce((s,i) => s+Number(i.amount),0), id: c.id })).filter(x => x.v>0).sort((a,b) => b.v-a.v).slice(0,8)
  const mx = revByClient.length ? Math.max(...revByClient.map(x => x.v)) : 1
  const [hoveredBar, setHoveredBar] = useState(null)

  return (
    <div>
      <div className="topbar"><h2>Welkom{myProfile?.full_name ? ', ' + myProfile.full_name.split(' ')[0] : ''}</h2><div className="topbar-right">
        <select value={period} onChange={e=>setPeriod(e.target.value)} style={{width:'auto'}}>
          <option value="all">Alle periodes</option>
          <option value="month">Deze maand</option>
          <option value="quarter">Dit kwartaal</option>
          <option value="year">Dit jaar</option>
        </select>
        <ClientModal onSave={onRefresh} activeOrgId={activeOrgId} trigger={<button className="btn btn-primary btn-sm">+ Klant</button>} /><ProjectModal clients={clients} onSave={onRefresh} activeOrgId={activeOrgId} trigger={<button className="btn btn-ghost btn-sm">+ Project</button>} /></div></div>
      <div className="content">
        {showOnboarding && <OnboardingChecklist clients={clients} projects={projects} orgMembers={orgMembers} showView={showView} onRefresh={onRefresh} activeOrgId={activeOrgId} onDismiss={dismissOnboarding} />}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-icon" style={{background:'var(--accent)'}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
            <div className="stat-label">{range ? 'Nieuwe klanten' : 'Klanten'}</div><div className="stat-value">{range ? clientsInPeriod.length : clients.length}<TrendBadge value={clientsCur - clientsPrev} /></div><div className="stat-sub">{range ? `${clients.length} totaal · ${clients.filter(c=>c.status==='actief').length} actief` : `${clients.filter(c=>c.status==='actief').length} actief`}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon" style={{background:'var(--accent)'}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2Z"/></svg></div>
            <div className="stat-label">{range ? 'Nieuwe projecten' : 'Projecten'}</div><div className="stat-value">{range ? projectsInPeriod.length : projects.length}<TrendBadge value={projectsCur - projectsPrev} /></div><div className="stat-sub">{range ? `${projects.length} totaal · ${projects.filter(p=>p.status==='actief').length} actief` : `${projects.filter(p=>p.status==='actief').length} actief`}{myRole!=='owner' && ' · allemaal aan jou toegewezen'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-icon" style={{background:'var(--accent)'}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
            <div className="stat-label">{range ? 'Omzet in periode' : 'Omzet betaald'}</div><div className="stat-value" style={{fontSize:18}}>{money(paidInPeriod)}<TrendBadge value={paidCur - paidPrev} format={v=>money(Math.abs(v))} /></div>{totalOpen>0&&<div className="stat-sub" style={{color:'var(--amber-text)'}}>{money(totalOpen)} nog te ontvangen</div>}
          </div>
          <div className="stat-card">
            <div className="stat-card-icon" style={{background:'var(--accent)'}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></div>
            <div className="stat-label">MRR</div><div className="stat-value" style={{fontSize:18}}>{money(totalMRR)}<TrendBadge value={newRecurringInPeriod} format={v=>v+' nieuw'} /></div><div className="stat-sub">per maand · huidig tarief</div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
          <div className="sc" style={{cursor:'pointer'}} onClick={()=>showView('pipeline')}>
            <div className="sc-head"><span className="sc-title">Pipeline</span></div>
            <div className="sc-body">
              {!openLeads.length ? <div className="empty">Geen open leads</div> : (
                <div className="dl-item" style={{borderBottom:'none',padding:0}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:22,fontWeight:700,fontFamily:'var(--heading-font)'}}>{openLeads.length}</div>
                    <div style={{fontSize:12,color:'var(--text-muted)'}}>open lead{openLeads.length!==1?'s':''} in behandeling</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="sc" style={{cursor: expiringHosting.length ? 'default' : 'pointer'}} onClick={()=>!expiringHosting.length && showView('hosting')}>
            <div className="sc-head"><span className="sc-title">Domein/SSL verloopt binnenkort</span></div>
            <div className="sc-body">
              {!expiringHosting.length ? <div className="empty">Niets verloopt binnen 60 dagen</div> : expiringHosting.slice(0,4).map(h => {
                const dDom = h.domain_expires ? daysN(h.domain_expires) : null
                const dSsl = h.ssl_expires ? daysN(h.ssl_expires) : null
                const soonest = [dDom, dSsl].filter(d => d !== null).sort((a,b)=>a-b)[0]
                const c = soonest <= 14 ? 'var(--red-text)' : 'var(--amber-text)'
                return (
                  <div key={h.id} className="dl-item" style={{cursor:'pointer'}} onClick={()=>showView('hosting')}>
                    <div className="dl-dot" style={{background: soonest<=14 ? 'var(--red)' : 'var(--amber)'}}></div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13}}>{h.site_name}</div>
                      <div style={{fontSize:11,color:'var(--text-faint)'}}>
                        {dDom!==null && `Domein: ${dDom<0?'verlopen':dDom+'d'}`}{dDom!==null&&dSsl!==null?' · ':''}{dSsl!==null && `SSL: ${dSsl<0?'verlopen':dSsl+'d'}`}
                      </div>
                    </div>
                    <div style={{fontSize:12,color:c,fontWeight:500,whiteSpace:'nowrap'}}>{soonest<0?'Verlopen':soonest+'d'}</div>
                  </div>
                )
              })}
            </div>
          </div>
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
              {!openTasks.length ? <div className="empty">Geen open taken</div> : openTasks.slice(0,6).map(t => {
                const dd = t.due_date ? daysN(t.due_date) : null
                return (
                  <div key={t.id} className="task-item">
                    <div className="task-check"></div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,color:dd<0?'var(--red-text)':'var(--text)'}}>{t.description}</div>
                      <div className="task-meta" style={{cursor:'pointer'}} onClick={()=>showView('project-detail',t.project_id)}>
                        {t.project?.name}
                        {t.priority && t.priority!=='normaal' && <span className={`badge ${t.priority==='hoog'?'bg-red':'bg-gray'}`} style={{fontSize:9}}>{t.priority}</span>}
                        {dd!==null && <span style={{color:dd<0?'var(--red-text)':'inherit',fontWeight:dd<0?600:400}}>{dd<0?'Te laat':dd===0?'Vandaag':fdate(t.due_date)}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
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
              {!revByClient.length ? <div className="empty">Nog geen betaalde facturen</div> : <>
                <div style={{display:'flex',gap:8}}>
                  <div style={{display:'flex',flexDirection:'column',justifyContent:'space-between',height:80,paddingTop:8,fontSize:10,color:'var(--text-faint)',textAlign:'right',flexShrink:0}}>
                    <span>{money(mx)}</span>
                    <span>{money(mx/2)}</span>
                    <span>€0</span>
                  </div>
                  <div className="chart-wrap" style={{flex:1,position:'relative'}}>
                    {revByClient.map((x,i)=>(
                      <div key={x.id} className="chart-col" onClick={()=>showView('client-detail',x.id)} onMouseEnter={()=>setHoveredBar(i)} onMouseLeave={()=>setHoveredBar(null)} style={{position:'relative'}}>
                        {hoveredBar===i && <div style={{position:'absolute',bottom:'100%',left:'50%',transform:'translateX(-50%)',marginBottom:6,background:'var(--text)',color:'var(--surface)',fontSize:11,fontWeight:600,padding:'4px 8px',borderRadius:6,whiteSpace:'nowrap',zIndex:10}}>{x.name}: {money(x.v)}</div>}
                        <div className="chart-bar" style={{height:Math.max(3,Math.round(x.v/mx*72))+'px'}}></div>
                        <div className="chart-lbl">{x.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6,marginTop:10,fontSize:11,color:'var(--text-muted)'}}>
                  <span style={{width:9,height:9,borderRadius:2,background:'var(--accent)',display:'inline-block'}}></span> Betaalde omzet per klant
                </div>
              </>}
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

function ClientsView({ clients, projects, allTasks, allInvoices = [], showView, onRefresh, activeOrgId }) {
  const [q, setQ] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [statusFilter, setStatusFilter] = useState(null)
  const [sort, setSort] = useState({ key: null, dir: 1 })

  function clientStats(c) {
    const revenue = allInvoices.filter(i => i.client_id===c.id && i.status==='betaald').reduce((s,i)=>s+Number(i.amount),0)
    const clientProjectIds = projects.filter(p=>p.client_id===c.id).map(p=>p.id)
    const taskDates = allTasks.filter(t=>clientProjectIds.includes(t.project_id)).map(t=>t.created_at)
    const invDates = allInvoices.filter(i=>i.client_id===c.id).map(i=>i.created_at || i.date)
    const lastActivity = [...taskDates, ...invDates].filter(Boolean).sort().slice(-1)[0] || null
    return { revenue, lastActivity }
  }

  function toggleSort(key) {
    setSort(s => s.key===key ? { key, dir: -s.dir } : { key, dir: 1 })
  }

  let filtered = clients.filter(c => (!q||(c.fname+c.lname+(c.company||'')+(c.email||'')).toLowerCase().includes(q.toLowerCase())) && (!statusFilter || (c.status||'actief')===statusFilter))
  if (sort.key) {
    filtered = [...filtered].sort((a,b) => {
      if (sort.key==='name') return sort.dir * (a.fname+a.lname).localeCompare(b.fname+b.lname)
      if (sort.key==='status') return sort.dir * (a.status||'actief').localeCompare(b.status||'actief')
      if (sort.key==='revenue') return sort.dir * (clientStats(a).revenue - clientStats(b).revenue)
      return 0
    })
  }
  const statusGroups = [
    { key:'actief', label:'Actief', color:'var(--green)' },
    { key:'prospect', label:'Prospect', color:'var(--blue)' },
    { key:'inactief', label:'Inactief', color:'var(--text-faint)' },
  ].map(g => ({ ...g, count: clients.filter(c=>(c.status||'actief')===g.key).length }))

  return (
    <div>
      <div className="topbar">
        <div><h2>Klanten</h2><p className="page-sub">Beheer en bekijk al je klanten op één plek.</p></div>
        <div className="topbar-right"><ClientModal onSave={onRefresh} activeOrgId={activeOrgId} trigger={<button className="btn btn-primary btn-sm">+ Nieuwe klant</button>} /></div>
      </div>
      <div className="page-toolbar">
        <div className="search-wrap"><span className="search-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Zoeken…" /></div>
        <div className="grow"></div>
        <div className="view-toggle">
          <button className={viewMode==='grid'?'active':''} onClick={()=>setViewMode('grid')} aria-label="Kaartweergave" title="Kaartweergave"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button>
          <button className={viewMode==='list'?'active':''} onClick={()=>setViewMode('list')} aria-label="Lijstweergave" title="Lijstweergave"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg></button>
        </div>
      </div>
      <div className="folder-grid">
        {statusGroups.map(g => (
          <div key={g.key} className="folder-card" onClick={()=>setStatusFilter(statusFilter===g.key?null:g.key)} style={statusFilter===g.key?{borderColor:'var(--accent)',background:'var(--accent-soft)'}:{}}>
            <div className="folder-card-icon" style={{background:g.color}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
            </div>
            <div><div className="folder-card-name">{g.label}</div><div className="folder-card-count">{g.count} klant{g.count!==1?'en':''}</div></div>
          </div>
        ))}
      </div>
      {viewMode === 'grid' ? (
        <div className="item-card-grid">
          {!filtered.length ? <div className="empty">Geen klanten</div> : filtered.map(c => (
            <div key={c.id} className="item-card" onClick={()=>showView('client-detail',c.id)}>
              <div className="item-card-thumb" style={{background:'var(--accent-soft)'}}>
                <div className={`avatar ${avC(c.id)}`} style={{width:48,height:48,fontSize:16}}>{ini(c)}</div>
              </div>
              <div className="item-card-body">
                <div style={{fontWeight:600,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.fname} {c.lname}</div>
                <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:8,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.company || '—'}</div>
                <Badge s={c.status||'actief'} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="content" style={{paddingTop:6}}>
          <div className="sc" style={{padding:0}}>
            <div className="cl-header">
              <div className="sortable" onClick={()=>toggleSort('name')}>Klant {sort.key==='name'&&(sort.dir>0?'↑':'↓')}</div>
              <div>Contact</div>
              <div className="sortable" onClick={()=>toggleSort('status')}>Status {sort.key==='status'&&(sort.dir>0?'↑':'↓')}</div>
              <div className="sortable" onClick={()=>toggleSort('revenue')}>Omzet {sort.key==='revenue'&&(sort.dir>0?'↑':'↓')}</div>
              <div>Laatste activiteit</div>
              <div></div>
            </div>
            {!filtered.length ? <div className="empty">Geen klanten</div> : filtered.map((c,idx) => {
              const pCount=projects.filter(p=>p.client_id===c.id).length
              const openT=allTasks.filter(t=>!t.done&&projects.find(p=>p.id===t.project_id)?.client_id===c.id).length
              const { revenue, lastActivity } = clientStats(c)
              return <div key={c.id} className="cl-row" onClick={()=>showView('client-detail',c.id)}>
                <div className="cl-name-cell"><div className={`avatar ${avC(c.id)}`}>{ini(c)}</div><div><div style={{fontWeight:500,fontSize:14}}>{c.fname} {c.lname}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{c.company||'—'}</div></div></div>
                <div style={{fontSize:13,color:'var(--text-muted)'}}>{c.email||'—'}</div>
                <div><Badge s={c.status||'actief'} /></div>
                <div style={{fontFamily:'var(--mono-font)',fontSize:13}}>{revenue>0?money(revenue):'—'}</div>
                <div style={{fontSize:12,color:'var(--text-faint)'}}>{lastActivity?fdate(lastActivity.slice(0,10)):'—'}</div>
                <div style={{textAlign:'right',display:'flex',gap:4,justifyContent:'flex-end',flexWrap:'wrap'}}>
                  {pCount>0&&<span className="badge bg-blue">{pCount} proj</span>}
                  {openT>0&&<span className="badge bg-amber">{openT} taken</span>}
                </div>
              </div>
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ClientDetailView({ client, projects, allTasks, allHosting = [], allMeetings = [], showView, onRefresh, activeOrgId, currentUserName }) {
  const [activeTab, setActiveTab] = useState('projects')
  const [invoices, setInvoices] = useState([])
  const [recurring, setRecurring] = useState([])
  const [notes, setNotes] = useState([])
  const clientProjects = projects.filter(p => p.client_id === client.id)
  const clientTasks = allTasks.filter(t => clientProjects.some(p => p.id === t.project_id))
  const clientMeetings = allMeetings.filter(m => m.client_id === client.id)

  const activity = [
    { date: client.created_at, text: 'Klant toegevoegd', color: 'var(--accent)' },
    ...clientProjects.map(p => ({ date: p.created_at, text: `Project gestart: ${p.name}`, color: 'var(--blue)' })),
    ...clientTasks.filter(t => t.done).map(t => ({ date: t.created_at, text: `Taak afgerond: ${t.description}`, color: 'var(--green)' })),
    ...invoices.map(i => ({ date: i.created_at || i.date, text: `Factuur ${i.invoice_number ? i.invoice_number+' ' : ''}${i.status==='betaald'?'betaald':'aangemaakt'}: ${i.description}`, color: 'var(--teal)' })),
    ...clientMeetings.map(m => ({ date: m.meeting_date, text: `Meeting: ${m.title}`, color: 'var(--purple)' })),
  ].filter(a => a.date).sort((a,b) => (b.date||'').localeCompare(a.date||''))

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
                {[['projects','Projecten'],['tasks','Taken'],['invoices','Facturen'],['recurring','Terugkerend'],['hosting','Hosting'],['meetings','Meetings'],['notes','Notities'],['activity','Activiteit']].map(([tab,label]) => (
                  <button key={tab} className={`client-tab${activeTab===tab?' active':''}`} onClick={()=>setActiveTab(tab)}>{label}</button>
                ))}
              </div>
              {activeTab==='projects' && (
                <div>
                  <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'flex-end'}}>
                    <ProjectModal clients={[client]} defaultClientId={client.id} onSave={onRefresh} activeOrgId={activeOrgId} trigger={<button className="btn btn-ghost btn-sm">+ Project</button>} />
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
                      {ptasks.map(t => <TaskItem key={t.id} task={t} onToggle={onRefresh} onDelete={onRefresh} authorName={currentUserName} />)}
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
                <ClientHostingTab clientId={client.id} onRefresh={onRefresh} activeOrgId={activeOrgId} />
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
              {activeTab==='activity' && (
                <div className="sc-body">
                  {!activity.length ? <div className="empty">Geen activiteit</div> : activity.map((a,i) => (
                    <div key={i} className="dl-item">
                      <div className="dl-dot" style={{background:a.color}}></div>
                      <div style={{flex:1,fontSize:13}}>{a.text}</div>
                      <div style={{fontSize:11,color:'var(--text-faint)',whiteSpace:'nowrap'}}>{fdate(a.date?.slice(0,10))}</div>
                    </div>
                  ))}
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
                <div style={{marginTop:14,paddingTop:12,borderTop:'1px solid var(--border)'}}>
                  <span className={`badge ${client.auth_user_id?'bg-green':'bg-gray'}`}>{client.auth_user_id?'Heeft een portaalaccount':'Nog geen portaalaccount'}</span>
                  <div style={{fontSize:11,color:'var(--text-faint)',marginTop:6}}>Toegang per project regel je op de projectpagina zelf.</div>
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
                {(() => {
                  const clientHosting = allHosting.filter(h => h.client_id === client.id)
                  const expiring = clientHosting.filter(h => (h.domain_expires && daysN(h.domain_expires) <= 30) || (h.ssl_expires && daysN(h.ssl_expires) <= 30))
                  const upcomingMeetings = allMeetings.filter(m => m.client_id === client.id && m.status === 'gepland' && m.meeting_date >= today())
                  return <>
                    {clientHosting.length > 0 && <div className="info-row"><span className="info-label">Hosting</span><span className="info-val" style={{color:expiring.length?'var(--amber-text)':'inherit'}}>{expiring.length>0?expiring.length+' verloopt binnenkort':clientHosting.length+' site(s) ok'}</span></div>}
                    {upcomingMeetings.length > 0 && <div className="info-row"><span className="info-label">Meetings</span><span className="info-val">{upcomingMeetings.length} gepland</span></div>}
                  </>
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProjectsView({ projects, clients, clientName, allTasks = [], showView, onRefresh, activeOrgId }) {
  const [q, setQ] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [viewMode, setViewMode] = useState('grid')
  const [statusFilter, setStatusFilter] = useState(null)
  const filtered = projects.filter(p => (!q||p.name.toLowerCase().includes(q.toLowerCase())||clientName(p.client_id).toLowerCase().includes(q.toLowerCase())) && (!statusFilter || p.status===statusFilter))
  function progressOf(p) {
    const ts = allTasks.filter(t => t.project_id === p.id)
    if (!ts.length) return null
    return Math.round(ts.filter(t=>t.done).length / ts.length * 100)
  }
  const statusGroups = [
    { key:'actief', label:'Actief', color:'var(--accent)' },
    { key:'on-hold', label:'On-hold', color:'var(--amber)' },
    { key:'afgerond', label:'Afgerond', color:'var(--text-faint)' },
  ].map(g => ({ ...g, count: projects.filter(p=>p.status===g.key).length }))

  return (
    <>
      <div>
        <div className="topbar">
          <div><h2>Projecten</h2><p className="page-sub">Al je projecten, per werkruimte.</p></div>
          <div className="topbar-right"><ProjectModal clients={clients} onSave={onRefresh} activeOrgId={activeOrgId} trigger={<button className="btn btn-primary btn-sm">+ Nieuw project</button>} /></div>
        </div>
        <div className="page-toolbar">
          <div className="search-wrap"><span className="search-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Zoeken…" /></div>
          <div className="grow"></div>
          <div className="view-toggle">
            <button className={viewMode==='grid'?'active':''} onClick={()=>setViewMode('grid')} aria-label="Kaartweergave" title="Kaartweergave"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button>
            <button className={viewMode==='list'?'active':''} onClick={()=>setViewMode('list')} aria-label="Lijstweergave" title="Lijstweergave"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg></button>
          </div>
        </div>
        <div className="folder-grid">
          {statusGroups.map(g => (
            <div key={g.key} className="folder-card" onClick={()=>setStatusFilter(statusFilter===g.key?null:g.key)} style={statusFilter===g.key?{borderColor:'var(--accent)',background:'var(--accent-soft)'}:{}}>
              <div className="folder-card-icon" style={{background:g.color}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
              </div>
              <div><div className="folder-card-name">{g.label}</div><div className="folder-card-count">{g.count} project{g.count!==1?'en':''}</div></div>
            </div>
          ))}
        </div>
        {!filtered.length ? (
          <div className="empty" style={{padding:'48px 20px'}}>
            <div style={{fontSize:14,fontWeight:600,color:'var(--text)',marginBottom:6}}>{projects.length ? 'Geen projecten gevonden' : 'Nog geen projecten'}</div>
            <div style={{fontSize:13,marginBottom:16,maxWidth:380,marginLeft:'auto',marginRight:'auto'}}>
              {projects.length ? 'Pas je zoekopdracht of filter aan.' : 'Een project is de werkruimte voor één klus — bijv. een website voor een klant. Hier houd je taken, documenten en collega\'s bij, en kun je de klant uitnodigen om mee te kijken.'}
            </div>
            {!projects.length && <ProjectModal clients={clients} onSave={onRefresh} activeOrgId={activeOrgId} trigger={<button className="btn btn-primary btn-sm">+ Eerste project aanmaken</button>} />}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="item-card-grid">
            {filtered.map(p => {
              const dd=p.deadline?daysN(p.deadline):null; const dC=dd!=null?(dd<0?'var(--red-text)':dd<=7?'var(--amber-text)':'var(--text-muted)'):'var(--text-muted)'
              const pct = progressOf(p)
              return (
                <div key={p.id} className="item-card" onClick={()=>showView('project-detail',p.id)}>
                  <div className="item-card-thumb" style={{background:p.color}}>
                    <span style={{color:'#fff',fontFamily:'var(--heading-font)',fontWeight:700,fontSize:22,opacity:.85}}>{p.name[0]?.toUpperCase()}</span>
                    <span style={{position:'absolute',top:8,right:8}}><Badge s={p.status} /></span>
                  </div>
                  <div className="item-card-body">
                    <div style={{fontWeight:600,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</div>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                      <div style={{fontSize:12,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{clientName(p.client_id)||'Geen klant'}</div>
                      {p.type && <span className="badge bg-gray" style={{fontSize:9}}>{p.type}</span>}
                    </div>
                    {pct!==null && <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                      <div style={{flex:1,height:5,background:'var(--border)',borderRadius:99}}><div style={{height:'100%',width:pct+'%',background:p.color,borderRadius:99}}></div></div>
                      <span style={{fontSize:10,color:'var(--text-faint)'}}>{pct}%</span>
                    </div>}
                    <div style={{fontSize:11,color:dC}}>{p.deadline?'Deadline: '+fdate(p.deadline):'Geen deadline'}</div>
                    {p.url && <div style={{display:'flex',gap:6,marginTop:8}} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>setPreviewUrl(p.url)} className="btn btn-ghost btn-xs">Preview</button>
                      <a href={p.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-xs" style={{textDecoration:'none'}}>↗ Open</a>
                    </div>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="content" style={{paddingTop:6}}>
            <div className="sc" style={{padding:0}}>
              <div className="pl-header"><div>Project</div><div>Klant</div><div>Voortgang</div><div>Deadline</div><div>Status</div></div>
              {filtered.map(p => {
                const dd=p.deadline?daysN(p.deadline):null; const dC=dd!=null?(dd<0?'var(--red-text)':dd<=7?'var(--amber-text)':'var(--text-muted)'):'var(--text-muted)'
                const pct = progressOf(p)
                return <div key={p.id} className="pl-row" onClick={()=>showView('project-detail',p.id)}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:10,height:10,borderRadius:'50%',background:p.color,flexShrink:0}}></div><div><div style={{fontWeight:500,fontSize:14}}>{p.name}{p.type && <span className="badge bg-gray" style={{fontSize:9,marginLeft:6}}>{p.type}</span>}</div>{p.url&&<div style={{fontSize:11,color:'var(--blue-text)'}}>{p.url.replace('https://','').replace('http://','')}</div>}</div></div>
                  <div style={{fontSize:13,color:'var(--text-muted)'}}>{clientName(p.client_id)||'—'}</div>
                  <div>{pct!==null ? <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:60,height:5,background:'var(--border)',borderRadius:99}}><div style={{height:'100%',width:pct+'%',background:p.color,borderRadius:99}}></div></div><span style={{fontSize:11,color:'var(--text-faint)'}}>{pct}%</span></div> : <span style={{fontSize:12,color:'var(--text-faint)'}}>—</span>}</div>
                  <div style={{fontSize:13,color:dC}}>{p.deadline?fdate(p.deadline):'—'}</div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6}}>
                    <Badge s={p.status} />
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      {p.url&&<button onClick={e=>{e.stopPropagation();setPreviewUrl(p.url)}} className="btn btn-ghost btn-xs" style={{textDecoration:'none'}}>Preview</button>}
                      {p.url&&<a href={p.url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} className="btn btn-ghost btn-xs" style={{textDecoration:'none'}}>↗ Open</a>}
                    </div>
                  </div>
                </div>
              })}
            </div>
          </div>
        )}
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

function ProjectDetailView({ project, clients, clientName, showView, onRefresh, orgMembers = [], myRole, currentUserId, currentUserName }) {
  const [tasks, setTasks] = useState([])
  const [showPreview, setShowPreview] = useState(true)
  const [projectMembers, setProjectMembers] = useState([])
  const [clientAccess, setClientAccess] = useState([])
  const [docs, setDocs] = useState([])
  const [timeEntries, setTimeEntries] = useState([])
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerStart, setTimerStart] = useState(null)
  const [timerNow, setTimerNow] = useState(Date.now())
  const [inviting, setInviting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()
  const client = clients.find(c => c.id === project.client_id)

  useEffect(() => { db.getTasks(project.id).then(setTasks) }, [project.id])
  const refreshTasks = () => db.getTasks(project.id).then(setTasks)
  const open=tasks.filter(t=>!t.done), done=tasks.filter(t=>t.done)
  const pct=tasks.length?Math.round(done.length/tasks.length*100):0
  const cn=clientName(project.client_id)

  const refreshTeam = () => db.getProjectMembers(project.id).then(setProjectMembers)
  const refreshAccess = () => db.getProjectClientAccess(project.id).then(setClientAccess)
  const refreshDocs = () => db.getProjectDocuments(project.id).then(setDocs)
  const refreshTime = () => db.getTimeEntries(project.id).then(setTimeEntries)
  useEffect(() => { refreshTeam(); refreshAccess(); refreshDocs(); refreshTime() }, [project.id])

  useEffect(() => {
    if (!timerRunning) return
    const iv = setInterval(() => setTimerNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [timerRunning])

  function startTimer() { setTimerStart(Date.now()); setTimerNow(Date.now()); setTimerRunning(true) }
  async function stopTimer() {
    const minutes = Math.max(1, Math.round((Date.now() - timerStart) / 60000))
    setTimerRunning(false)
    try { await db.createTimeEntry({ project_id: project.id, minutes, date: today(), description: 'Timer' }); refreshTime() }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function deleteTimeEntry(id) {
    try { await db.deleteTimeEntry(id); refreshTime() }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  const totalMinutes = timeEntries.reduce((s,e) => s + e.minutes, 0)
  const fmtHM = m => `${Math.floor(m/60)}u ${m%60}m`

  async function toggleMember(userId, isMember) {
    try {
      if (isMember) await db.removeProjectMember(project.id, userId)
      else await db.addProjectMember(project.id, userId)
      refreshTeam()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  async function inviteClient() {
    if (!client?.email) return showToast('Vul eerst een e-mailadres in bij deze klant.', 'error')
    setInviting(true)
    try {
      await db.inviteClientToProject(project, client)
      showToast('Uitnodiging verstuurd naar ' + client.email)
    } catch (e) { showToast('Fout bij uitnodigen: ' + e.message, 'error') }
    finally { setInviting(false) }
  }
  async function revokeClient() {
    if (!client) return
    try { await db.revokeProjectAccess(project.id, client.id); refreshAccess(); showToast('Toegang ingetrokken') }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try { await db.uploadProjectDocument(project.id, file, false); refreshDocs() }
    catch (e) { showToast('Fout bij uploaden: ' + e.message, 'error') }
    finally { setUploading(false); e.target.value = '' }
  }
  async function toggleDocVisible(doc) {
    try { await db.updateProjectDocument(doc.id, { visible_to_client: !doc.visible_to_client }); refreshDocs() }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function openDoc(doc) {
    try { const url = await db.getProjectDocumentUrl(doc.storage_path); window.open(url, '_blank') }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function removeDoc(doc) {
    if (!confirm('Document verwijderen?')) return
    try { await db.deleteProjectDocument(doc.id, doc.storage_path); refreshDocs() }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

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
              <div className="sc-head"><span className="sc-title">Taken</span><TaskModal projectId={project.id} onSave={refreshTasks} members={projectMembers} trigger={<button className="btn btn-ghost btn-sm">+ Taak</button>} /></div>
              <div className="sc-body">
                {!tasks.length ? <div className="empty">Nog geen taken</div> : <>
                  {open.map(t=><TaskItem key={t.id} task={t} onToggle={refreshTasks} onDelete={refreshTasks} authorName={currentUserName} />)}
                  {done.length>0&&<div style={{padding:'10px 0 4px',fontSize:11,fontWeight:600,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.05em'}}>Afgerond ({done.length})</div>}
                  {done.map(t=><TaskItem key={t.id} task={t} onToggle={refreshTasks} onDelete={refreshTasks} authorName={currentUserName} />)}
                </>}
              </div>
              <QuickTaskAdd projectId={project.id} onAdd={refreshTasks} />
            </div>
            <div className="sc">
              <div className="sc-head">
                <span className="sc-title">Docs</span>
                <button className="btn btn-ghost btn-sm" onClick={()=>fileRef.current.click()} disabled={uploading}>{uploading?'Uploaden…':'+ Bestand'}</button>
                <input ref={fileRef} type="file" style={{display:'none'}} onChange={handleUpload} />
              </div>
              <div className="sc-body">
                {!docs.length ? <div className="empty">Nog geen documenten</div> : docs.map(d => (
                  <div key={d.id} className="info-row" style={{alignItems:'center'}}>
                    <span className="info-val" style={{cursor:'pointer',color:'var(--blue-text)'}} onClick={()=>openDoc(d)}>{d.file_name}</span>
                    <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                      <button
                        type="button" onClick={()=>toggleDocVisible(d)}
                        title={d.visible_to_client?'Zichtbaar voor klant':'Niet zichtbaar voor klant'}
                        style={{color:d.visible_to_client?'var(--accent-text)':'var(--text-faint)',display:'flex',alignItems:'center'}}
                      ><EyeIcon off={!d.visible_to_client} /></button>
                      <button type="button" className="task-del" onClick={()=>removeDoc(d)} aria-label={`"${d.file_name}" verwijderen`}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="sc">
              <div className="sc-head">
                <span className="sc-title">Tijd</span>
                {!timerRunning
                  ? <button className="btn btn-ghost btn-sm" onClick={startTimer}>▶ Start timer</button>
                  : <button className="btn btn-primary btn-sm" onClick={stopTimer}>■ Stop ({Math.floor((timerNow-timerStart)/60000)}m)</button>}
              </div>
              <div className="sc-body">
                <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:10}}>Totaal: <strong style={{color:'var(--text)'}}>{fmtHM(totalMinutes)}</strong></div>
                {!timeEntries.length ? <div className="empty">Nog geen uren geregistreerd</div> : timeEntries.map(e => (
                  <div key={e.id} className="info-row" style={{alignItems:'center'}}>
                    <div style={{flex:1}}>
                      <span className="info-val">{e.description || 'Tijd geregistreerd'}</span>
                      <div style={{fontSize:11,color:'var(--text-faint)'}}>{fdate(e.date)} · {e.profiles?.full_name || ''}</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                      <span style={{fontFamily:'var(--mono-font)',fontSize:13}}>{fmtHM(e.minutes)}</span>
                      {e.user_id === currentUserId && <button type="button" className="task-del" onClick={()=>deleteTimeEntry(e.id)} aria-label="Tijd verwijderen">×</button>}
                    </div>
                  </div>
                ))}
              </div>
              <QuickTimeAdd projectId={project.id} onAdd={refreshTime} />
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
                <div className="info-row"><span className="info-label">Tijd besteed</span><span className="info-val">{fmtHM(totalMinutes)}</span></div>
              </div>
            </div>
            <div className="sc">
              <div className="sc-head"><span className="sc-title">Team</span></div>
              <div className="sc-body">
                {!orgMembers.length ? <div className="empty">Geen collega's</div> : orgMembers.map(m => {
                  const isMember = projectMembers.some(pm => pm.id === m.id)
                  return (
                    <label key={m.id} className="info-row" style={{cursor: myRole==='owner' ? 'pointer' : 'default',alignItems:'center'}}>
                      <input type="checkbox" checked={isMember} disabled={myRole!=='owner'} onChange={()=>toggleMember(m.id, isMember)} style={{width:15,height:15,flexShrink:0}} />
                      <span className="info-val">{m.full_name || m.id}{m.role==='owner'?' (eigenaar)':''}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            {client && (
              <div className="sc">
                <div className="sc-head"><span className="sc-title">Klant</span></div>
                <div className="sc-body">
                  <div className="info-row"><span className="info-label">Contact</span><span className="info-val" style={{cursor:'pointer',color:'var(--blue-text)'}} onClick={()=>showView('client-detail',client.id)}>{client.fname} {client.lname}</span></div>
                  <div className="info-row">
                    <span className="info-label">Portaal</span>
                    <span className="info-val">
                      {clientAccess.includes(client.id)
                        ? <span className="badge bg-green">Toegang tot dit project</span>
                        : <span className="badge bg-gray">Geen toegang</span>}
                    </span>
                  </div>
                  <div style={{marginTop:10}}>
                    {clientAccess.includes(client.id)
                      ? <button className="btn btn-ghost btn-xs" onClick={revokeClient}>Toegang intrekken</button>
                      : <button className="btn btn-ghost btn-xs" onClick={inviteClient} disabled={inviting}>{inviting?'Versturen…':'Uitnodigen voor dit project'}</button>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TasksView({ allTasks, showView }) {
  const [filter, setFilter] = useState('open')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [dueFilter, setDueFilter] = useState('all')
  const filtered = allTasks.filter(t => {
    if (filter==='done' ? !t.done : filter==='open' ? t.done : false) return false
    if (priorityFilter!=='all' && (t.priority||'normaal')!==priorityFilter) return false
    if (dueFilter!=='all') {
      const dd = t.due_date ? daysN(t.due_date) : null
      if (dueFilter==='overdue' && !(dd!==null && dd<0)) return false
      if (dueFilter==='today' && dd!==0) return false
      if (dueFilter==='week' && !(dd!==null && dd>=0 && dd<=7)) return false
    }
    return true
  })
  const PRIO_COLOR = { hoog:'var(--red)', normaal:'var(--blue)', laag:'var(--text-faint)' }
  return (
    <div>
      <div className="topbar"><h2>Alle taken</h2><div className="topbar-right"><div className="tabs"><button className={`tab${filter==='open'?' active':''}`} onClick={()=>setFilter('open')}>Open</button><button className={`tab${filter==='done'?' active':''}`} onClick={()=>setFilter('done')}>Afgerond</button><button className={`tab${filter==='all'?' active':''}`} onClick={()=>setFilter('all')}>Alles</button></div></div></div>
      <div className="page-toolbar">
        <select value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)} style={{width:'auto'}}>
          <option value="all">Alle prioriteiten</option>
          <option value="hoog">Hoog</option>
          <option value="normaal">Midden</option>
          <option value="laag">Laag</option>
        </select>
        <select value={dueFilter} onChange={e=>setDueFilter(e.target.value)} style={{width:'auto'}}>
          <option value="all">Alle deadlines</option>
          <option value="overdue">Vervallen</option>
          <option value="today">Vandaag</option>
          <option value="week">Deze week</option>
        </select>
      </div>
      <div className="content">
        <div className="sc"><div className="sc-body">
          {!filtered.length ? <div className="empty">Geen taken</div> : filtered.map(t => {
            const dd = t.due_date ? daysN(t.due_date) : null
            const overdue = dd !== null && dd < 0 && !t.done
            return (
              <div key={t.id} className="task-item">
                <div className={`task-check${t.done?' done':''}`} style={{display:'flex',alignItems:'center',justifyContent:'center'}}>{t.done&&<span style={{color:'#fff',fontSize:10}}>✓</span>}</div>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:PRIO_COLOR[t.priority||'normaal'],flexShrink:0}}></span>
                    <div style={{fontSize:13,textDecoration:t.done?'line-through':'none',color:t.done?'var(--text-faint)':overdue?'var(--red-text)':'var(--text)'}}>{t.description}</div>
                  </div>
                  <div className="task-meta">
                    {t.project&&<span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'1px 7px',borderRadius:99,fontSize:11,fontWeight:500,background:t.project.color+'18',color:t.project.color,cursor:'pointer'}} onClick={()=>showView('project-detail',t.project_id)}>{t.project.name}</span>}
                    {t.due_date && <span style={{color:overdue?'var(--red-text)':'inherit',fontWeight:overdue?600:400}}>{overdue?'Te laat · ':''}{fdate(t.due_date)}</span>}
                    {t.assignee?.full_name && <span style={{display:'inline-flex',alignItems:'center',gap:3}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>{t.assignee.full_name}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div></div>
      </div>
    </div>
  )
}

function FinanceView({ allInvoices, allRecurring, totalPaid, totalOpen, totalMRR, clients, onRefresh }) {
  const [period, setPeriod] = useState('all')
  const lateAmt = allInvoices.filter(i=>i.status==='te laat').reduce((s,i)=>s+Number(i.amount),0)
  const byFreq = { maandelijks:0, kwartaallijks:0, jaarlijks:0 }
  allRecurring.filter(r=>r.status==='actief').forEach(r=>{ byFreq[r.freq]=(byFreq[r.freq]||0)+Number(r.amount) })

  function inPeriod(dateStr) {
    if (period==='all' || !dateStr) return true
    const d = new Date(dateStr); const now = new Date()
    if (period==='month') return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth()
    if (period==='quarter') return d.getFullYear()===now.getFullYear() && Math.floor(d.getMonth()/3)===Math.floor(now.getMonth()/3)
    if (period==='year') return d.getFullYear()===now.getFullYear()
    return true
  }
  const sorted = [...allInvoices].filter(i=>inPeriod(i.date)).sort((a,b)=>(b.date||'').localeCompare(a.date||''))

  async function markPaid(inv) {
    try { await db.updateInvoice(inv.id, { status: 'betaald' }); onRefresh(); showToast('Factuur gemarkeerd als betaald') }
    catch(e) { showToast('Fout: ' + e.message, 'error') }
  }

  function exportCsv() {
    const header = ['Factuurnummer','Klant','Omschrijving','Datum','Vervaldatum','Bedrag','Status']
    const rows = sorted.map(i => [
      i.invoice_number||'', `${i.clients?.fname||''} ${i.clients?.lname||''}`.trim(), i.description, i.date||'', i.due_date||'', i.amount, i.status
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `facturen-${today()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="topbar">
        <h2>Financiën</h2>
        <div className="topbar-right">
          <select value={period} onChange={e=>setPeriod(e.target.value)} style={{width:'auto'}}>
            <option value="all">Alle periodes</option>
            <option value="month">Deze maand</option>
            <option value="quarter">Dit kwartaal</option>
            <option value="year">Dit jaar</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={exportCsv}>↓ Exporteer CSV</button>
          <InvoiceModal clients={clients} onSave={onRefresh} trigger={<button className="btn btn-primary btn-sm">+ Factuur</button>} />
        </div>
      </div>
      <div className="content">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Totaal betaald</div><div className="stat-value" style={{fontSize:18}}>{money(totalPaid)}</div></div>
          <div className="stat-card"><div className="stat-label">Nog te ontvangen</div><div className="stat-value" style={{fontSize:18,color:'var(--amber-text)'}}>{money(totalOpen)}</div>{lateAmt>0&&<div className="stat-sub" style={{color:'var(--red-text)'}}>{money(lateAmt)} te laat</div>}</div>
          <div className="stat-card"><div className="stat-label">MRR</div><div className="stat-value" style={{fontSize:18,color:'var(--teal-text)'}}>{money(totalMRR)}</div><div className="stat-sub">ARR: {money(totalMRR*12)}</div></div>
          <div className="stat-card"><div className="stat-label">Facturen</div><div className="stat-value">{sorted.length}</div></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16}}>
          <div className="sc" style={{padding:0}}>
            <div className="fin-header"><div>Nr. / Klant</div><div>Datum</div><div>Vervaldatum</div><div style={{textAlign:'right'}}>Bedrag</div><div style={{textAlign:'right'}}>Status</div></div>
            {!sorted.length ? <div className="empty">Geen facturen in deze periode</div> : sorted.map(i => (
              <div key={i.id} className="fin-row">
                <div><div style={{fontWeight:500}}>{i.invoice_number ? i.invoice_number+' · ' : ''}{i.description}</div><div style={{fontSize:11,color:'var(--text-muted)'}}>{i.clients?.fname} {i.clients?.lname}{i.clients?.company?' · '+i.clients.company:''}</div></div>
                <div style={{color:'var(--text-muted)'}}>{fdate(i.date)}</div>
                <div style={{color:'var(--text-muted)'}}>{fdate(i.due_date)}</div>
                <div style={{fontFamily:'var(--mono-font)',textAlign:'right'}}>{money(i.amount)}</div>
                <div style={{textAlign:'right',display:'flex',gap:6,justifyContent:'flex-end',alignItems:'center'}}>
                  <Badge s={i.status} />
                  {i.status!=='betaald' && <button className="btn btn-ghost btn-xs" onClick={()=>markPaid(i)} title="Markeer als betaald">✓ Betaald</button>}
                </div>
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

function CompanySettingsView({ activeOrgId, orgName, settings, onRefresh, onAddWorkspace }) {
  const [form, setForm] = useState({
    name: orgName || '',
    primary_color: settings?.primary_color || '#3db68e',
    vat_number: settings?.vat_number || '',
    coc_number: settings?.coc_number || '',
    invoice_address: settings?.invoice_address || '',
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  useEffect(() => {
    setForm({
      name: orgName || '',
      primary_color: settings?.primary_color || '#3db68e',
      vat_number: settings?.vat_number || '',
      coc_number: settings?.coc_number || '',
      invoice_address: settings?.invoice_address || '',
    })
  }, [orgName, settings])

  async function save() {
    setSaving(true)
    try {
      await db.updateOrganization(activeOrgId, { name: form.name })
      await db.upsertCompanySettings(activeOrgId, {
        primary_color: form.primary_color, vat_number: form.vat_number || null,
        coc_number: form.coc_number || null, invoice_address: form.invoice_address || null,
      })
      onRefresh()
      showToast('Bedrijfsinstellingen opgeslagen')
    } catch(e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { showToast('Logo mag max 2MB zijn.', 'error'); return }
    setUploading(true)
    try {
      const url = await db.uploadCompanyLogo(activeOrgId, file)
      await db.upsertCompanySettings(activeOrgId, { logo_url: url })
      onRefresh()
      showToast('Logo bijgewerkt')
    } catch(e) { showToast('Fout bij uploaden: ' + e.message, 'error') }
    finally { setUploading(false) }
  }

  return (
    <div>
      <div className="topbar"><h2>Bedrijfsinstellingen</h2></div>
      <div className="content" style={{ maxWidth: 680 }}>
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Bedrijfsprofiel</span></div>
          <div className="sc-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 'var(--rsm)', flexShrink: 0,
                background: 'var(--bg2)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
              }}>
                {settings?.logo_url
                  ? <img src={settings.logo_url} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Geen logo</span>
                }
              </div>
              <div>
                <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()} disabled={uploading}>
                  {uploading ? 'Uploaden…' : 'Logo uploaden'}
                </button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>Vervangt de bedrijfsnaam in de zijbalk. Max 2MB.</div>
              </div>
            </div>
            <div className="form-group"><label>Bedrijfsnaam</label><input value={form.name} onChange={f('name')} /></div>
            <div className="form-group">
              <label>Primaire kleur</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="color" value={form.primary_color} onChange={f('primary_color')} style={{ width: 44, height: 36, padding: 2 }} />
                <input value={form.primary_color} onChange={f('primary_color')} style={{ flex: 1 }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Voor toekomstige white-label weergave.</div>
            </div>
          </div>
        </div>

        <div className="sc">
          <div className="sc-head"><span className="sc-title">Facturatiegegevens</span></div>
          <div className="sc-body">
            <div className="form-row">
              <div className="form-group"><label>BTW-nummer</label><input value={form.vat_number} onChange={f('vat_number')} placeholder="NL000000000B01" /></div>
              <div className="form-group"><label>KVK-nummer</label><input value={form.coc_number} onChange={f('coc_number')} placeholder="12345678" /></div>
            </div>
            <div className="form-group"><label>Factuuradres</label><textarea value={form.invoice_address} onChange={f('invoice_address')} rows={3} placeholder="Straatnaam 1&#10;1234 AB Plaats" /></div>
          </div>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Instellingen opslaan'}</button>

        <div className="sc" style={{marginTop:24}}>
          <div className="sc-head"><span className="sc-title">Werkruimtes</span></div>
          <div className="sc-body">
            <div style={{fontSize:12,color:'var(--text-faint)',marginBottom:10}}>De meeste accounts hebben precies één werkruimte. Heb je een tweede bedrijf dat je apart wilt beheren?</div>
            <button className="btn btn-ghost btn-sm" onClick={onAddWorkspace}>+ Extra werkruimte toevoegen</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TeamView({ members, onRefresh, myProfile, activeOrgId }) {
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const ownerCount = members.filter(m => m.role === 'owner').length

  async function invite() {
    if (!email.trim()) return
    setInviting(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true, data: { invite_organization_id: activeOrgId } }
      })
      if (error) throw error
      showToast('Uitnodiging verstuurd naar ' + email)
      setEmail('')
    } catch (e) {
      showToast('Fout bij uitnodigen: ' + e.message, 'error')
    } finally {
      setInviting(false)
    }
  }

  async function changeRole(member, role) {
    if (member.role === 'owner' && role !== 'owner' && ownerCount <= 1) {
      return showToast('Een organisatie moet minstens één eigenaar hebben.', 'error')
    }
    try {
      await db.updateMemberRole(member.id, activeOrgId, role)
      onRefresh()
      showToast('Rol bijgewerkt')
    } catch (e) {
      showToast('Fout bij wijzigen rol: ' + e.message, 'error')
    }
  }

  return (
    <div>
      <div className="topbar"><h2>Team</h2></div>
      <div className="content">
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Collega uitnodigen</span></div>
          <div className="sc-body">
            <div style={{display:'flex',gap:8}}>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="collega@bedrijf.nl" onKeyDown={e=>e.key==='Enter'&&invite()} />
              <button className="btn btn-primary btn-sm" onClick={invite} disabled={inviting}>{inviting ? 'Versturen…' : 'Uitnodigen'}</button>
            </div>
          </div>
        </div>
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Teamleden ({members.length})</span></div>
          <div className="sc-body">
            {!members.length ? <div className="empty">Nog geen teamleden</div> : members.map(m => (
              <div key={m.id} className="info-row">
                <span className="info-label">{m.full_name || m.id}{m.id===myProfile?.id?' (jij)':''}</span>
                <span className="info-val">
                  {m.id === myProfile?.id ? (
                    <span className="badge bg-blue">{m.role === 'owner' ? 'Eigenaar' : 'Teamlid'}</span>
                  ) : (
                    <select value={m.role} onChange={e=>changeRole(m, e.target.value)} style={{fontSize:13,padding:'5px 8px'}}>
                      <option value="member">Teamlid</option>
                      <option value="owner">Eigenaar</option>
                    </select>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function TaskComments({ taskId, authorName = 'Teamlid', authorType = 'staff' }) {
  const [comments, setComments] = useState([])
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const refresh = () => db.getTaskComments(taskId).then(setComments)
  useEffect(() => { if (open) refresh() }, [open, taskId])
  async function add() {
    if (!text.trim()) return
    try {
      await db.createTaskComment({ task_id: taskId, author_name: authorName, author_type: authorType, content: text.trim() })
      setText(''); refresh()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  return (
    <div style={{marginTop:4}}>
      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setOpen(o => !o)} style={{fontSize:11}}>
        {open ? '▲' : '▼'} Reacties{comments.length > 0 ? ` (${comments.length})` : ''}
      </button>
      {open && (
        <div style={{marginTop:6,background:'var(--bg2)',borderRadius:'var(--rsm)',padding:'8px 10px'}}>
          {!comments.length && <div style={{fontSize:11,color:'var(--text-faint)'}}>Nog geen reacties</div>}
          {comments.map(c => (
            <div key={c.id} style={{padding:'5px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontSize:12}}>{c.content}</div>
              <div style={{fontSize:10,color:'var(--text-faint)',marginTop:2}}>{c.author_name}{c.author_type==='client'?' (klant)':''} · {fdate(c.created_at?.slice(0,10))}</div>
            </div>
          ))}
          <div style={{display:'flex',gap:6,marginTop:8}}>
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Reactie toevoegen…" style={{flex:1,fontSize:12,padding:'5px 8px'}} onKeyDown={e => e.key==='Enter' && add()} />
            <button className="btn btn-primary btn-xs" onClick={add}>Plaats</button>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskItem({ task, onToggle, onDelete, authorName }) {
  async function toggle() { await db.updateTask(task.id, { done: !task.done }); onToggle() }
  async function toggleInProgress() { await db.updateTask(task.id, { in_progress: !task.in_progress }); onToggle() }
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
          {!task.done&&<button type="button" onClick={toggleInProgress} className={`badge ${task.in_progress?'bg-blue':'bg-gray'}`} style={{fontSize:10,cursor:'pointer',border:'none'}}>{task.in_progress?'In behandeling':'Markeer als in behandeling'}</button>}
          {task.visible_to_client&&<span style={{display:'inline-flex',alignItems:'center',gap:3,color:'var(--accent-text)'}}><EyeIcon size={11} /> Klant</span>}
          {task.created_by==='client'&&<span className="badge bg-blue" style={{fontSize:10}}>Via klant</span>}
        </div>
        <TaskComments taskId={task.id} authorName={authorName} authorType="staff" />
      </div>
      <button type="button" className="task-del" onClick={del} aria-label={`Taak "${task.description}" verwijderen`}>×</button>
    </div>
  )
}

function QuickTimeAdd({ projectId, onAdd }) {
  const [desc, setDesc] = useState('')
  const [hours, setHours] = useState('')
  const [date, setDate] = useState(today())
  async function add() {
    const h = parseFloat(hours)
    if (!h || h <= 0) return
    await db.createTimeEntry({ project_id: projectId, minutes: Math.round(h * 60), date, description: desc.trim() || null })
    setDesc(''); setHours(''); onAdd()
  }
  return (
    <div className="quick-add">
      <input type="text" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Omschrijving (optioneel)…" onKeyDown={e=>e.key==='Enter'&&add()} />
      <input type="number" min="0.25" step="0.25" value={hours} onChange={e=>setHours(e.target.value)} placeholder="Uren" style={{width:80}} />
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
      <button className="btn btn-ghost btn-sm" onClick={add}>Voeg toe</button>
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

function NewWorkspaceModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!name.trim()) return showToast('Vul een naam in.', 'error')
    setSaving(true)
    try {
      const { org } = await db.createOrganization(name.trim())
      setName(''); onClose(); onCreated(org.id)
      showToast('Bedrijf "' + org.name + '" aangemaakt')
    } catch (e) {
      showToast('Fout bij aanmaken: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Nieuw bedrijf">
      <FG label="Naam"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Bijv. Tweede bedrijf" autoFocus onKeyDown={e=>e.key==='Enter'&&save()} /></FG>
      <ModalActions onCancel={onClose} onSave={save} saving={saving} />
    </Modal>
  )
}

function ClientModal({ client, onSave, trigger, activeOrgId }) {
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
      else await db.createClient({ ...form, organization_id: activeOrgId })
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

function ProjectModal({ project, clients, defaultClientId, onSave, trigger, activeOrgId }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [color, setColor] = useState(PROJ_COLORS[0])
  const init = { name:'', client_id:'', url:'', start_date:'', deadline:'', status:'actief', type:'' }
  const [form, setForm] = useState(init)
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}))
  function openModal() { setForm(project?{name:project.name||'',client_id:project.client_id||'',url:project.url||'',start_date:project.start_date||'',deadline:project.deadline||'',status:project.status||'actief',type:project.type||''}:{...init,client_id:defaultClientId||''}); setColor(project?.color||PROJ_COLORS[0]); setOpen(true) }
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
        type: form.type || null,
        color
      }
      if(project) await db.updateProject(project.id, data)
      else await db.createProject({ ...data, organization_id: activeOrgId })
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
      <FR>
        <FG label="Status"><select value={form.status} onChange={f('status')}><option value="actief">Actief</option><option value="on-hold">On-hold</option><option value="afgerond">Afgerond</option></select></FG>
        <FG label="Type (optioneel)">
          <input value={form.type} onChange={f('type')} placeholder="bijv. WordPress" list="project-types" />
          <datalist id="project-types"><option value="WordPress" /><option value="Webflow" /><option value="Shopify" /><option value="Custom" /><option value="WooCommerce" /></datalist>
        </FG>
      </FR>
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

function TaskModal({ projectId, onSave, trigger, members = [] }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ description:'', due_date:'', priority:'normaal', assigned_to:'', visible_to_client:false })
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}))
  async function save() {
    if(!form.description.trim()) return
    setSaving(true)
    try {
      await db.createTask({ project_id: projectId, description: form.description.trim(), due_date: form.due_date||null, priority: form.priority, assigned_to: form.assigned_to||null, done: false, visible_to_client: form.visible_to_client, created_by: 'staff' })
      setOpen(false); onSave()
    } catch(e) {
      showToast('Fout bij opslaan: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return <>
    {React.cloneElement(trigger,{onClick:()=>{setForm({description:'',due_date:'',priority:'normaal',assigned_to:'',visible_to_client:false});setOpen(true)}})}
    <Modal open={open} onClose={()=>setOpen(false)} title="Nieuwe taak">
      <FG label="Omschrijving"><textarea value={form.description} onChange={f('description')} autoFocus /></FG>
      <FR><FG label="Deadline"><input type="date" value={form.due_date} onChange={f('due_date')} /></FG><FG label="Prioriteit"><select value={form.priority} onChange={f('priority')}><option value="normaal">Normaal</option><option value="hoog">Hoog</option><option value="laag">Laag</option></select></FG></FR>
      <FG label="Toegewezen aan">
        <select value={form.assigned_to} onChange={f('assigned_to')}>
          <option value="">— Niemand specifiek —</option>
          {members.map(m=><option key={m.id} value={m.id}>{m.full_name || m.id}</option>)}
        </select>
      </FG>
      <ClientVisibleCheckbox checked={form.visible_to_client} onChange={v=>setForm(p=>({...p,visible_to_client:v}))} />
      <ModalActions onCancel={()=>setOpen(false)} onSave={save} saving={saving} />
    </Modal>
  </>
}

function InvoiceModal({ clientId, clients, onSave, trigger }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ client_id: clientId||'', description:'', amount:'', date:today(), due_date:'', status:'concept' })
  const f = k => e => setForm(p=>({...p,[k]:e.target.value}))
  async function save() {
    const targetClient = clientId || form.client_id
    if(!targetClient) return showToast('Kies een klant.', 'error')
    if(!form.description.trim()||!form.amount) return
    setSaving(true)
    try {
      await db.createInvoice({ client_id: targetClient, description: form.description, amount: parseFloat(form.amount), date: form.date, due_date: form.due_date||null, status: form.status })
      setOpen(false); onSave()
      showToast('Factuur aangemaakt')
    } catch(e) {
      showToast('Fout bij opslaan: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }
  return <>
    {React.cloneElement(trigger,{onClick:()=>{setForm({client_id:clientId||'',description:'',amount:'',date:today(),due_date:'',status:'concept'});setOpen(true)}})}
    <Modal open={open} onClose={()=>setOpen(false)} title="Nieuwe factuur">
      {!clientId && <FG label="Klant"><select value={form.client_id} onChange={f('client_id')}><option value="">— Kies een klant —</option>{(clients||[]).map(c=><option key={c.id} value={c.id}>{c.fname} {c.lname}{c.company?' ('+c.company+')':''}</option>)}</select></FG>}
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
    return d !== null && d <= 60
  })
  const sslWarn = allHosting.filter(h => {
    if (!h.ssl_expires) return false
    const d = daysN(h.ssl_expires)
    return d !== null && d <= 60
  })

  function expiryColor(dateStr) {
    if (!dateStr) return 'var(--text-faint)'
    const d = daysN(dateStr)
    if (d < 0) return 'var(--red-text)'
    if (d <= 14) return 'var(--red-text)'
    if (d <= 60) return 'var(--amber-text)'
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
              <div style={{fontSize:13,color:expiryColor(h.domain_expires),fontWeight:daysN(h.domain_expires)<=60?500:400}}>{h.domain_expires?fdate(h.domain_expires):'—'}</div>
              <div style={{fontSize:13,color:expiryColor(h.ssl_expires),fontWeight:daysN(h.ssl_expires)<=60?500:400}}>{h.ssl_expires?fdate(h.ssl_expires):'—'}</div>
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
function ClientHostingTab({ clientId, onRefresh, activeOrgId }) {
  const [hosting, setHosting] = useState([])
  const [clients, setClients] = useState([])

  useEffect(() => {
    db.getHostingForClient(clientId).then(setHosting)
    db.getClients(activeOrgId).then(setClients)
  }, [clientId, activeOrgId])

  const refresh = () => db.getHostingForClient(clientId).then(setHosting)

  function expiryColor(dateStr) {
    if (!dateStr) return 'var(--text-faint)'
    const d = daysN(dateStr)
    if (d < 0) return 'var(--red-text)'
    if (d <= 14) return 'var(--red-text)'
    if (d <= 60) return 'var(--amber-text)'
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
              {h.domain_expires && <div className="info-row" style={{padding:'4px 0'}}><span className="info-label" style={{width:70}}>Domein exp.</span><span className="info-val" style={{color:expiryColor(h.domain_expires),fontWeight:daysN(h.domain_expires)<=60?500:400}}>{fdate(h.domain_expires)}</span></div>}
              {h.ssl_expires && <div className="info-row" style={{padding:'4px 0'}}><span className="info-label" style={{width:70}}>SSL exp.</span><span className="info-val" style={{color:expiryColor(h.ssl_expires),fontWeight:daysN(h.ssl_expires)<=60?500:400}}>{fdate(h.ssl_expires)}</span></div>}
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
