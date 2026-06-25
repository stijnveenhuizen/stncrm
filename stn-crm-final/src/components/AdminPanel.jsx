import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import * as db from '../lib/db'

const STEP_LABELS = {
  welcome: 'Welkom', company_setup: 'Bedrijf', first_client: 'Eerste klant',
  first_project: 'Eerste project', demo_tour: 'Rondleiding', completed: 'Klaar',
}

export default function AdminPanel({ onClose, onImpersonated }) {
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [obStats, setObStats] = useState(null)
  const [obError, setObError] = useState('')

  useEffect(() => {
    db.adminListAccounts()
      .then(d => setUsers(d.users))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
    db.adminGetOnboardingStats()
      .then(setObStats)
      .catch(e => setObError(e.message))
  }, [])

  async function impersonate(user) {
    setBusyId(user.id)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      sessionStorage.setItem('stn_admin_original_session', JSON.stringify({
        access_token: session.access_token, refresh_token: session.refresh_token
      }))
      const result = await db.adminImpersonate(user.email)
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
          Alle accounts op het platform. Inloggen als een gebruiker geeft je hun echte sessie — je ziet daarna exact hun werkruimte(s) en klanten. Dit wordt gelogd; gebruik het alleen om klantproblemen te reproduceren of te ondersteunen.
        </p>
        {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Laden…</div>}
        {error && <div style={{ background: 'var(--red-soft)', color: 'var(--red-text)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {users.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{u.full_name || '(geen naam)'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>{u.email}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {!u.memberships.length
                    ? <span style={{ fontSize: 10, color: 'var(--text-faint)', fontStyle: 'italic' }}>geen werkruimte</span>
                    : u.memberships.map(m => (
                      <span key={m.organization_id} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--bg2)', color: 'var(--text-muted)' }}>
                        {m.organization_name}{m.role === 'owner' ? ' · eigenaar' : ''}
                      </span>
                    ))}
                </div>
              </div>
              <button
                onClick={() => impersonate(u)}
                disabled={busyId === u.id}
                style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'none', color: 'var(--text)', fontSize: 12, cursor: 'pointer', opacity: busyId === u.id ? 0.6 : 1, flexShrink: 0 }}
              >{busyId === u.id ? 'Bezig…' : 'Inloggen als'}</button>
            </div>
          ))}
          {!loading && !users.length && <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-faint)' }}>Geen accounts gevonden.</div>}
        </div>

        <h2 style={{ fontFamily: 'var(--heading-font)', fontSize: 17, fontWeight: 700, margin: '32px 0 14px' }}>Onboarding statistieken</h2>
        {obError && <div style={{ background: 'var(--red-soft)', color: 'var(--red-text)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{obError}</div>}
        {!obStats && !obError && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Laden…</div>}
        {obStats && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Gestart</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--heading-font)', marginTop: 4 }}>{obStats.totalStarted}</div>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Afgerond</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--heading-font)', marginTop: 4, color: 'var(--green-text)' }}>{obStats.totalCompleted}</div>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Geskipt</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--heading-font)', marginTop: 4, color: 'var(--amber-text)' }}>{obStats.totalSkipped}</div>
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
              {obStats.steps.map((s, i) => {
                const maxViewed = obStats.steps[0]?.viewed || 1
                const widthPct = Math.max(6, Math.round((s.viewed / maxViewed) * 100))
                return (
                  <div key={s.step} style={{ marginBottom: i === obStats.steps.length - 1 ? 0 : 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                      <span style={{ fontWeight: 600 }}>{i + 1}. {STEP_LABELS[s.step] || s.step}</span>
                      <span style={{ color: 'var(--text-faint)' }}>
                        {s.viewed} gezien · {s.completed} voltooid · {s.skipped} geskipt
                        {s.avgDurationSeconds != null ? ` · gem. ${Math.round(s.avgDurationSeconds)}s` : ''}
                      </span>
                    </div>
                    <div style={{ height: 22, background: 'var(--bg2)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                      <div style={{ height: '100%', width: widthPct + '%', background: 'var(--accent)', borderRadius: 6, transition: 'width .3s' }}></div>
                    </div>
                    {i > 0 && s.dropoffPct > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--red-text)', marginTop: 4 }}>−{s.dropoffPct}% drop-off t.o.v. vorige stap</div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
