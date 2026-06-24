import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import * as db from './lib/db'
import Login from './components/Login.jsx'
import Signup from './components/Signup.jsx'
import Dashboard from './components/Dashboard.jsx'
import ClientPortal from './components/ClientPortal.jsx'
import AdminPanel from './components/AdminPanel.jsx'

const ADMIN_SESSION_KEY = 'stn_admin_original_session'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState(null) // 'staff' | { client }
  const [roleError, setRoleError] = useState(false)
  const [showSignup, setShowSignup] = useState(false)
  const [fatalError, setFatalError] = useState('')
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [restoringSession, setRestoringSession] = useState(false)

  const isPlatformAdmin = !!session?.user?.email && session.user.email === import.meta.env.VITE_PLATFORM_ADMIN_EMAIL
  const impersonationActive = !!sessionStorage.getItem(ADMIN_SESSION_KEY)

  async function stopImpersonating() {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY)
    if (!raw) return
    setRestoringSession(true)
    try {
      const { access_token, refresh_token } = JSON.parse(raw)
      await supabase.auth.setSession({ access_token, refresh_token })
    } finally {
      sessionStorage.removeItem(ADMIN_SESSION_KEY)
      setRestoringSession(false)
    }
  }

  async function resolveRole(session) {
    if (!session) { setRole(null); return }
    const profile = await db.getProfile(session.user.id)
    if (profile) { setRole('staff'); return }

    let client = await db.getClientByAuthUserId(session.user.id)
    if (!client && session.user.user_metadata?.portal_client_id) {
      try {
        client = await db.linkClientPortalAccount(session.user.user_metadata.portal_client_id)
      } catch (e) { /* self-link policy rejected it, fall through to error state */ }
    }
    if (client && session.user.user_metadata?.portal_project_id) {
      try {
        await db.grantProjectAccess(session.user.user_metadata.portal_project_id, client.id)
      } catch (e) { /* already granted, or claim doesn't match — harmless either way */ }
    }
    if (client) { setRole({ client }); return }

    if (session.user.user_metadata?.invite_organization_id) {
      try {
        await db.linkTeamMemberAccount(session.user.user_metadata.invite_organization_id)
        setRole('staff')
        return
      } catch (e) { /* self-link policy rejected it, fall through to error state */ }
    }
    setRoleError(true)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      resolveRole(session).catch(e => setFatalError(e.message || 'Onbekende fout')).finally(() => setLoading(false))
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setRoleError(false)
      setFatalError('')
      resolveRole(session).catch(e => setFatalError(e.message || 'Onbekende fout'))
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text-muted)',fontSize:13}}>
      Laden…
    </div>
  )

  if (!session) return showSignup
    ? <Signup onBackToLogin={() => setShowSignup(false)} />
    : <Login onSignupClick={() => setShowSignup(true)} />

  if (fatalError) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:10,color:'var(--text-muted)',fontSize:13,textAlign:'center',padding:24}}>
      <div>Er ging iets mis bij het laden van je account.</div>
      <div style={{fontSize:11,color:'var(--text-faint)',fontFamily:'monospace'}}>{fatalError}</div>
      <button onClick={() => supabase.auth.signOut()} style={{padding:'7px 14px',borderRadius:7,border:'1px solid var(--border-strong)',background:'none',color:'var(--text-muted)',fontSize:13,cursor:'pointer'}}>Uitloggen</button>
    </div>
  )

  if (roleError) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:10,color:'var(--text-muted)',fontSize:13,textAlign:'center',padding:24}}>
      <div>Dit account is nog niet gekoppeld aan een klant- of teamprofiel.</div>
      <div>Neem contact op met je webdesigner.</div>
      <button onClick={() => supabase.auth.signOut()} style={{padding:'7px 14px',borderRadius:7,border:'1px solid var(--border-strong)',background:'none',color:'var(--text-muted)',fontSize:13,cursor:'pointer'}}>Uitloggen</button>
    </div>
  )

  if (showAdminPanel) return <AdminPanel onClose={() => setShowAdminPanel(false)} onImpersonated={() => setShowAdminPanel(false)} />

  const banner = impersonationActive && (
    <div style={{background:'var(--amber)',color:'#1a1a18',fontSize:13,fontWeight:600,textAlign:'center',padding:'8px 16px',display:'flex',alignItems:'center',justifyContent:'center',gap:12,position:'sticky',top:0,zIndex:200}}>
      <span>Je kijkt als {session.user.email}</span>
      <button onClick={stopImpersonating} disabled={restoringSession} style={{padding:'4px 10px',borderRadius:6,border:'1px solid rgba(0,0,0,.25)',background:'rgba(255,255,255,.4)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
        {restoringSession ? 'Terugschakelen…' : 'Stop impersoneren'}
      </button>
    </div>
  )

  if (role === 'staff') return <>{banner}<Dashboard session={session} isPlatformAdmin={isPlatformAdmin} onOpenAdminPanel={() => setShowAdminPanel(true)} /></>
  if (role && role.client) return <>{banner}<ClientPortal session={session} client={role.client} /></>
  return null
}
