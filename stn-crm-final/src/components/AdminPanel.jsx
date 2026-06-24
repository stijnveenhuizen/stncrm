import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as db from '../lib/db'

export default function AdminPanel({ onClose, onImpersonated }) {
  const [orgs, setOrgs] = useState([])
  const [profiles, setProfiles] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    db.adminListAccounts()
      .then(d => { setOrgs(d.organizations); setProfiles(d.profiles) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function impersonate(profile) {
    if (!profile.email) return
    setBusyId(profile.id)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      sessionStorage.setItem('stn_admin_original_session', JSON.stringify({
        access_token: session.access_token, refresh_token: session.refresh_token
      }))
      const result = await db.adminImpersonate(profile.email)
      const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: result.token_hash, type: 'magiclink' })
      if (verifyErr) throw verifyErr
      onImpersonated()
    } catch (e) {
      sessionStorage.removeItem('stn_admin_original_session')
      setError(e.message)
      setBusyId(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: 24 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'var(--heading-font)', fontSize: 20, fontWeight: 700 }}>Platform-admin</h1>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>Sluiten</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20 }}>
          Inloggen als een gebruiker geeft je hun echte sessie. Dit wordt gelogd. Gebruik dit alleen om klantproblemen te reproduceren of te ondersteunen.
        </p>
        {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Laden…</div>}
        {error && <div style={{ background: 'var(--red-soft)', color: 'var(--red-text)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}
        {orgs.map(org => {
          const members = profiles.filter(p => p.organization_id === org.id)
          return (
            <div key={org.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 14 }}>{org.name}</div>
              <div>
                {members.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{p.full_name || '(geen naam)'}{p.role === 'owner' && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}> · eigenaar</span>}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.email || 'onbekend e-mailadres'}</div>
                    </div>
                    <button
                      onClick={() => impersonate(p)}
                      disabled={busyId === p.id || !p.email}
                      style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text)', fontSize: 12, cursor: 'pointer', opacity: busyId === p.id ? 0.6 : 1 }}
                    >{busyId === p.id ? 'Bezig…' : 'Inloggen als'}</button>
                  </div>
                ))}
                {!members.length && <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-faint)' }}>Geen teamleden</div>}
              </div>
            </div>
          )
        })}
        {!loading && !orgs.length && <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Nog geen organisaties.</div>}
      </div>
    </div>
  )
}
