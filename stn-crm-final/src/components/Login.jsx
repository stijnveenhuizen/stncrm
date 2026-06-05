import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Ongeldig e-mailadres of wachtwoord.')
    setLoading(false)
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)'}}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'36px 32px',width:360,boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>
        <div style={{marginBottom:28}}>
          <h1 style={{fontSize:18,fontWeight:600,letterSpacing:'-.02em',marginBottom:4}}>STN CRM</h1>
          <p style={{fontSize:13,color:'var(--text-muted)'}}>Log in om verder te gaan</p>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{marginBottom:14}}>
            <label>E-mailadres</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="jij@stnwebdesign.nl" required autoFocus />
          </div>
          <div style={{marginBottom:20}}>
            <label>Wachtwoord</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && <div style={{background:'var(--red-soft)',color:'var(--red-text)',borderRadius:'var(--rsm)',padding:'8px 12px',fontSize:13,marginBottom:14}}>{error}</div>}
          <button type="submit" disabled={loading} style={{width:'100%',padding:'10px',background:'var(--text)',color:'#fff',borderRadius:'var(--rsm)',fontWeight:500,fontSize:14,cursor:loading?'not-allowed':'pointer',opacity:loading?.7:1}}>
            {loading ? 'Inloggen…' : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  )
}
