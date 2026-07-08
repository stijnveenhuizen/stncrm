import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from './lib/supabase'
import * as db from './lib/db'
import Login from './components/Login.jsx'
import CompleteAccount from './components/auth/CompleteAccount.jsx'
import ForgotPassword from './components/auth/ForgotPassword.jsx'
import ResetPassword from './components/auth/ResetPassword.jsx'
import Dashboard from './components/Dashboard.jsx'
import ClientPortal from './components/ClientPortal.jsx'
import AdminApp from './components/admin/AdminApp.jsx'
import { ADMIN_SESSION_KEY } from './lib/constants.js'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState(null) // 'staff' | { client }
  const [roleError, setRoleError] = useState(false)
  const [fatalError, setFatalError] = useState('')
  const [restoringSession, setRestoringSession] = useState(false)

  const isPlatformAdmin = !!session?.user?.email && session.user.email === import.meta.env.VITE_PLATFORM_ADMIN_EMAIL
  const impersonationActive = !!sessionStorage.getItem(ADMIN_SESSION_KEY)
  const pathname = window.location.pathname
  const onAdminRoute = pathname.startsWith('/admin')

  async function stopImpersonating() {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY)
    if (!raw) return
    setRestoringSession(true)
    try {
      const { access_token, refresh_token, logId } = JSON.parse(raw)
      await supabase.auth.setSession({ access_token, refresh_token })
      sessionStorage.removeItem(ADMIN_SESSION_KEY)
      if (logId) await db.adminEndImpersonation(logId).catch(() => {})
      window.location.href = '/admin/gebruikers'
    } finally {
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

    // Laatste redmiddel — maar alleen als er geen enkele aanwijzing is dat dit
    // eigenlijk een klantportaal-account hoort te zijn (portal_client_id-claim),
    // anders zou een kapotte/verlopen klant-uitnodiging hier per ongeluk een
    // staff-profiel krijgen in plaats van de juiste foutmelding te tonen.
    // Dit vangt specifiek: een bestaand account zonder profiel, klantkoppeling
    // of invite-claim (bv. na een databasereset die profiles leegmaakte maar
    // auth.users liet staan) — de RLS-policy "insert own profile" staat dit toe
    // voor de eigen ingelogde gebruiker. Zo land je op het bestaande "nog geen
    // werkruimte"-scherm i.p.v. vast te lopen op een foutmelding.
    if (!session.user.user_metadata?.portal_client_id) {
      try {
        await db.upsertProfile(session.user.id, { full_name: session.user.user_metadata?.full_name || null })
        setRole('staff')
        return
      } catch (e) { /* echt niets te doen — toon de foutmelding */ }
    }

    setRoleError(true)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      resolveRole(session).catch(e => setFatalError(e.message || 'Onbekende fout')).finally(() => setLoading(false))
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setRoleError(false)
      setFatalError('')
      resolveRole(session).catch(e => setFatalError(e.message || 'Onbekende fout'))
      // Impersonatie zet zelf ook een SIGNED_IN event af (verifyOtp) — die niet als
      // gewone inlog loggen, anders lijkt het alsof de admin zelf continu inlogt.
      if (event === 'SIGNED_IN' && session && !sessionStorage.getItem(ADMIN_SESSION_KEY)) db.logEvent('login', 'login')
      if (event === 'SIGNED_OUT') db.logEvent('logout', 'logout')
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    function handleError(event) {
      const err = event.error || event.reason
      db.logClientError(err?.message || String(event.message || event.reason || 'Onbekende fout'), err?.stack, window.location.pathname)
    }
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleError)
    return () => { window.removeEventListener('error', handleError); window.removeEventListener('unhandledrejection', handleError) }
  }, [])

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text-muted)',fontSize:13}}>
      Laden…
    </div>
  )

  // Deze drie routes beheren hun eigen sessie-status (een uitnodigings-/
  // herstellink zet zelf al een sessie op basis van tokens in de URL) en staan
  // daarom los van de normale !session/resolveRole-afhandeling hieronder.
  if (pathname.startsWith('/registreer')) return <CompleteAccount />
  if (pathname.startsWith('/wachtwoord-vergeten')) return <ForgotPassword />
  if (pathname.startsWith('/wachtwoord-instellen')) return <ResetPassword />

  if (!session) return <Login />

  // /admin is een losstaand deel van de app — staat los van de normale
  // staff/klant-rol hierboven. AdminApp doet zelf nogmaals de echte (server-side)
  // autorisatiecheck bij elke data-aanroep; dit is alleen de client-side UX-redirect.
  if (onAdminRoute) {
    if (!isPlatformAdmin) { window.location.href = '/'; return null }
    return <AdminApp session={session} />
  }

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

  const banner = impersonationActive && (
    <motion.div initial={{ y: -52, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      style={{background:'var(--amber)',color:'#1a1a18',fontSize:13,fontWeight:600,textAlign:'center',padding:'8px 16px',display:'flex',alignItems:'center',justifyContent:'center',gap:12,position:'sticky',top:0,zIndex:200}}>
      <span>⚠️ Je bekijkt de app als {session.user.email}</span>
      <button onClick={stopImpersonating} disabled={restoringSession} style={{padding:'4px 10px',borderRadius:6,border:'1px solid rgba(0,0,0,.25)',background:'rgba(255,255,255,.4)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
        {restoringSession ? 'Terugschakelen…' : 'Terug naar admin →'}
      </button>
    </motion.div>
  )

  if (role === 'staff') return <>{banner}<Dashboard session={session} isPlatformAdmin={isPlatformAdmin} onOpenAdmin={() => { window.location.href = '/admin' }} /></>
  if (role && role.client) return <>{banner}<ClientPortal session={session} client={role.client} /></>
  return null
}
