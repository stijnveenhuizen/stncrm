import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import AdminOverview from './AdminOverview.jsx'
import AdminUsers from './AdminUsers.jsx'
import AdminWorkspaces from './AdminWorkspaces.jsx'
import AdminStats from './AdminStats.jsx'
import AdminOnboarding from './AdminOnboarding.jsx'
import AdminSystem from './AdminSystem.jsx'

export function CountUp({ value, duration = 800 }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (value == null) return
    const start = Date.now()
    let raf
    function tick() {
      const t = Math.min(1, (Date.now() - start) / duration)
      setDisplay(Math.round((1 - Math.pow(1 - t, 3)) * value)) // easeOut
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => raf && cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{value == null ? '—' : display.toLocaleString('nl-NL')}</>
}

const NAV = [
  ['overzicht', 'Overzicht'],
  ['gebruikers', 'Gebruikers'],
  ['werkruimtes', 'Werkruimtes'],
  ['statistieken', 'Statistieken'],
  ['onboarding', 'Onboarding'],
  ['systeem', 'Systeem & Logs'],
]

const CSS = `
  .admin-shell{min-height:100vh;background:#0F0F0F;color:#F4F4F5}
  .admin-topbar{height:52px;background:#161616;border-bottom:1px solid #2A2A2A;display:flex;align-items:center;justify-content:space-between;padding:0 20px;position:sticky;top:0;z-index:20}
  .admin-title{font-size:13px;font-weight:700;color:#F4F4F5}
  .admin-back{color:#A1A1AA;font-size:13px;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:6px}
  .admin-back:hover{color:#F4F4F5}
  .admin-body{display:flex}
  .admin-sidebar{width:200px;min-width:200px;background:#161616;border-right:1px solid #2A2A2A;min-height:calc(100vh - 52px);padding:12px 8px}
  .admin-nav-item{display:block;width:100%;text-align:left;padding:7px 10px;border-radius:6px;font-size:13px;font-weight:500;color:#A1A1AA;background:none;border:none;cursor:pointer;margin-bottom:1px;transition:background-color 120ms ease,color 120ms ease}
  .admin-nav-item:hover{background:#1F1F1F;color:#F4F4F5}
  .admin-nav-item.active{background:#0d2e22;color:#14B8A6;font-weight:600}
  .admin-main{flex:1;padding:32px;min-width:0}
  .admin-card{background:#1A1A1A;border:1px solid #2A2A2A;border-radius:10px}
  .admin-kpi{background:#1A1A1A;border:1px solid #2A2A2A;border-radius:10px;padding:20px 24px}
  .admin-kpi-label{font-size:11px;font-weight:600;color:#71717A;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
  .admin-kpi-value{font-size:26px;font-weight:700;font-family:var(--heading-font,inherit);color:#F4F4F5}
  .admin-table{width:100%;border-collapse:collapse;font-size:13px}
  .admin-table th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;color:#71717A;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #2A2A2A}
  .admin-table td{padding:10px 14px;border-bottom:1px solid #232323;color:#E4E4E7}
  .admin-table tr:last-child td{border-bottom:none}
  .admin-table tr.clickable{cursor:pointer}
  .admin-table tr.clickable:hover{background:#1F1F1F}
  .admin-input{height:32px;padding:0 10px;background:#111;border:1px solid #2A2A2A;border-radius:6px;color:#F4F4F5;font-size:13px}
  .admin-input::placeholder{color:#71717A}
  .admin-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:500}
  .admin-btn{height:30px;padding:0 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid #2A2A2A;background:#1F1F1F;color:#F4F4F5}
  .admin-btn:hover{background:#262626}
  .admin-btn-danger{background:#DC2626;color:#fff;border-color:transparent}
  .admin-btn-danger:hover{opacity:.9}
  .admin-tabs{display:flex;gap:4px;border-bottom:1px solid #2A2A2A;margin-bottom:16px}
  .admin-tab{padding:8px 12px;font-size:13px;font-weight:500;color:#71717A;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer}
  .admin-tab.active{color:#F4F4F5;border-bottom-color:#14B8A6}
`

export default function AdminApp({ session }) {
  const [view, setView] = useState('overzicht')

  async function logout() { await supabase.auth.signOut(); window.location.href = '/' }

  return (
    <div className="admin-shell">
      <style>{CSS}</style>
      <div className="admin-topbar">
        <button className="admin-back" onClick={() => { window.location.href = '/' }}>← Terug naar CRM</button>
        <span className="admin-title">STN CRM — Admin</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#A1A1AA' }}>ingelogd als {session.user.email}</span>
          <button className="admin-btn" onClick={logout}>Uitloggen</button>
        </div>
      </div>
      <div className="admin-body">
        <nav className="admin-sidebar">
          {NAV.map(([key, label]) => (
            <button key={key} className={`admin-nav-item${view === key ? ' active' : ''}`} onClick={() => setView(key)}>{label}</button>
          ))}
        </nav>
        <main className="admin-main">
          <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
            {view === 'overzicht' && <AdminOverview onNavigate={setView} />}
            {view === 'gebruikers' && <AdminUsers />}
            {view === 'werkruimtes' && <AdminWorkspaces />}
            {view === 'statistieken' && <AdminStats />}
            {view === 'onboarding' && <AdminOnboarding />}
            {view === 'systeem' && <AdminSystem />}
          </motion.div>
        </main>
      </div>
    </div>
  )
}
