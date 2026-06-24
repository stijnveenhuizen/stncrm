import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import * as db from './lib/db'
import Login from './components/Login.jsx'
import Dashboard from './components/Dashboard.jsx'
import ClientPortal from './components/ClientPortal.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState(null) // 'staff' | { client }
  const [roleError, setRoleError] = useState(false)

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
    if (client) { setRole({ client }); return }
    setRoleError(true)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      resolveRole(session).then(() => setLoading(false))
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setRoleError(false)
      resolveRole(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text-muted)',fontSize:13}}>
      Laden…
    </div>
  )

  if (!session) return <Login />

  if (roleError) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:10,color:'var(--text-muted)',fontSize:13,textAlign:'center',padding:24}}>
      <div>Dit account is nog niet gekoppeld aan een klant- of teamprofiel.</div>
      <div>Neem contact op met je webdesigner.</div>
      <button onClick={() => supabase.auth.signOut()} style={{padding:'7px 14px',borderRadius:7,border:'1px solid var(--border-strong)',background:'none',color:'var(--text-muted)',fontSize:13,cursor:'pointer'}}>Uitloggen</button>
    </div>
  )

  if (role === 'staff') return <Dashboard session={session} />
  if (role && role.client) return <ClientPortal session={session} client={role.client} />
  return null
}
