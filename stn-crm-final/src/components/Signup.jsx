import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import * as db from '../lib/db'

export default function Signup({ onBackToLogin }) {
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSignup(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data, error: signUpErr } = await supabase.auth.signUp({ email, password })
      if (signUpErr) throw signUpErr
      if (!data.session) {
        setDone(true)
        return
      }
      await db.createOrganization(company.trim())
    } catch (e) {
      setError(e.message || 'Registreren mislukt.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--bg)', fontFamily:'var(--body-font)', padding: '16px'
    }}>
      <div style={{width:'100%', maxWidth: 400, padding:'0 8px'}}>
        <div style={{textAlign:'center', marginBottom:40}}>
          <div style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:52, height:52, borderRadius:14, background:'var(--accent)',
            marginBottom:16, boxShadow:'0 4px 14px rgba(61,182,142,0.35)'
          }}>
            <span style={{color:'#fff', fontSize:24, fontFamily:'var(--heading-font)', fontWeight:700}}>S</span>
          </div>
          <h1 style={{fontFamily:'var(--heading-font)', fontSize:22, fontWeight:700, letterSpacing:'-.02em', marginBottom:6}}>STN CRM</h1>
          <p style={{fontSize:13, color:'var(--text-muted)'}}>Nieuw bedrijf registreren</p>
        </div>

        <div style={{
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:'var(--r)', padding:'32px 28px', boxShadow:'var(--shadow-md)'
        }}>
          {done ? (
            <div style={{textAlign:'center'}}>
              <h2 style={{fontFamily:'var(--heading-font)', fontSize:17, fontWeight:600, marginBottom:10}}>Bevestig je e-mailadres</h2>
              <p style={{fontSize:13, color:'var(--text-muted)'}}>We hebben een bevestigingslink gestuurd naar {email}. Klik daarop om je bedrijf te activeren.</p>
            </div>
          ) : (
            <>
              <h2 style={{fontFamily:'var(--heading-font)', fontSize:17, fontWeight:600, marginBottom:24, letterSpacing:'-.01em'}}>Bedrijf registreren</h2>
              <form onSubmit={handleSignup}>
                <div style={{marginBottom:14}}>
                  <label>Bedrijfsnaam</label>
                  <input type="text" value={company} onChange={e=>setCompany(e.target.value)} placeholder="Jouw webdesignbureau" required autoFocus />
                </div>
                <div style={{marginBottom:14}}>
                  <label>E-mailadres</label>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="jij@bedrijf.nl" required />
                </div>
                <div style={{marginBottom:22}}>
                  <label>Wachtwoord</label>
                  <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
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
                  {loading ? 'Registreren…' : 'Bedrijf registreren →'}
                </button>
              </form>
            </>
          )}
        </div>

        <div style={{textAlign:'center', marginTop:24, fontSize:12, color:'var(--text-muted)'}}>
          Al een account? <span onClick={onBackToLogin} style={{color:'var(--accent-text)', fontWeight:600, cursor:'pointer'}}>Inloggen</span>
        </div>
      </div>
    </div>
  )
}
