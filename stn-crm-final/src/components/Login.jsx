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
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--bg)', fontFamily:'var(--body-font)'
    }}>
      <div style={{width:400, padding:'0 24px'}}>
        {/* Logo / branding */}
        <div style={{textAlign:'center', marginBottom:40}}>
          <div style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:52, height:52, borderRadius:14, background:'var(--accent)',
            marginBottom:16, boxShadow:'0 4px 14px rgba(61,182,142,0.35)'
          }}>
            <span style={{color:'#fff', fontSize:24, fontFamily:'var(--heading-font)', fontWeight:700}}>S</span>
          </div>
          <h1 style={{fontFamily:'var(--heading-font)', fontSize:22, fontWeight:700, letterSpacing:'-.02em', marginBottom:6}}>STN CRM</h1>
          <p style={{fontSize:13, color:'var(--text-muted)'}}>Webdesign klantenbeheer</p>
        </div>

        {/* Card */}
        <div style={{
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:'var(--r)', padding:'32px 28px',
          boxShadow:'var(--shadow-md)'
        }}>
          <h2 style={{fontFamily:'var(--heading-font)', fontSize:17, fontWeight:600, marginBottom:24, letterSpacing:'-.01em'}}>Inloggen</h2>
          <form onSubmit={handleLogin}>
            <div style={{marginBottom:14}}>
              <label>E-mailadres</label>
              <input
                type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="jij@stnwebdesign.nl" required autoFocus
              />
            </div>
            <div style={{marginBottom:22}}>
              <label>Wachtwoord</label>
              <input
                type="password" value={password} onChange={e=>setPassword(e.target.value)}
                placeholder="••••••••" required
              />
            </div>
            {error && (
              <div style={{
                background:'var(--red-soft)', color:'var(--red-text)',
                borderRadius:'var(--rsm)', padding:'9px 12px', fontSize:13, marginBottom:16,
                border:'1px solid rgba(220,38,38,0.15)'
              }}>{error}</div>
            )}
            <button type="submit" disabled={loading} style={{
              width:'100%', padding:'11px', background:'var(--accent)', color:'#fff',
              borderRadius:'var(--rsm)', fontWeight:600, fontSize:14,
              fontFamily:'var(--heading-font)', cursor: loading?'not-allowed':'pointer',
              opacity: loading?.7:1, transition:'all .15s',
              boxShadow:'0 2px 8px rgba(61,182,142,0.3)'
            }}>
              {loading ? 'Inloggen…' : 'Inloggen →'}
            </button>
          </form>
        </div>

        <div style={{textAlign:'center', marginTop:24, fontSize:11, color:'var(--text-faint)'}}>
          STN Webdesign · Hardenberg
        </div>
      </div>
    </div>
  )
}
