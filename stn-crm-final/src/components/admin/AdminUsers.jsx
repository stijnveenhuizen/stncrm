import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as db from '../../lib/db'
import { fdate, showToast } from '../Dashboard.jsx'
import { ADMIN_SESSION_KEY } from '../../lib/constants.js'
import { supabase } from '../../lib/supabase'

const ROLE_LABEL = { owner: 'EIGENAAR', member: 'TEAMLID', client: 'CLIENT' }

function timeAgo(iso) {
  if (!iso) return 'nooit'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${Math.max(1, mins)} min geleden`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} uur geleden`
  const days = Math.floor(hours / 24)
  return `${days} dag${days !== 1 ? 'en' : ''} geleden`
}

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('alle')
  const [sort, setSort] = useState('created')
  const [detailUserId, setDetailUserId] = useState(null)
  const [impersonateUser, setImpersonateUser] = useState(null)

  const refresh = () => db.adminListAccounts().then(d => setUsers(d.users)).catch(e => setError(e.message)).finally(() => setLoading(false))
  useEffect(() => { refresh() }, [])

  const filtered = useMemo(() => {
    let list = users.filter(u => {
      if (q && !(u.full_name + u.email).toLowerCase().includes(q.toLowerCase())) return false
      if (statusFilter !== 'alle' && u.status !== statusFilter) return false
      return true
    })
    list = [...list].sort((a, b) => sort === 'created' ? new Date(b.created_at) - new Date(a.created_at) : (a.full_name || a.email).localeCompare(b.full_name || b.email))
    return list
  }, [users, q, statusFilter, sort])

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Gebruikers</h1>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="admin-input" style={{ flex: 1 }} placeholder="Zoeken op naam/email…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="admin-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="alle">Status: Alle</option>
          <option value="actief">Actief</option>
          <option value="inactief">Inactief</option>
        </select>
        <select className="admin-input" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="created">Gesorteerd op: Aangemaakt</option>
          <option value="naam">Gesorteerd op: Naam</option>
        </select>
      </div>
      {loading ? <div style={{ color: 'var(--text-muted-tok)', fontSize: 13 }}>Laden…</div> : (
        <div className="admin-card" style={{ overflow: 'hidden' }}>
          <table className="admin-table">
            <thead><tr><th>Gebruiker</th><th>Werkruimtes</th><th>Rol</th><th>Aangemaakt</th><th>Laatste login</th><th>Status</th><th>Acties</th></tr></thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="clickable" onClick={() => setDetailUserId(u.id)}>
                  <td><div style={{ fontWeight: 500 }}>{u.full_name || '(geen naam)'}</div><div style={{ fontSize: 11, color: 'var(--text-muted-tok)' }}>{u.email}</div></td>
                  <td>{u.memberships.length}</td>
                  <td><span className="admin-badge" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>{ROLE_LABEL[u.role] || u.role}</span></td>
                  <td>{fdate(u.created_at?.slice(0, 10))}</td>
                  <td>{timeAgo(u.last_sign_in_at)}</td>
                  <td><span className="admin-badge" style={{ background: u.status === 'actief' ? 'var(--accent-subtle)' : 'var(--bg-subtle)', color: u.status === 'actief' ? 'var(--success)' : 'var(--text-muted-tok)' }}>{u.status}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="admin-btn" onClick={() => setDetailUserId(u.id)}>Bekijk details</button>
                      <button className="admin-btn admin-btn-danger" onClick={() => setImpersonateUser(u)}>Login als</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} style={{ color: 'var(--text-muted-tok)', textAlign: 'center', padding: 24 }}>Geen gebruikers gevonden.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {detailUserId && <UserDetailPanel userId={detailUserId} onClose={() => setDetailUserId(null)} onImpersonate={u => setImpersonateUser(u)} />}
      </AnimatePresence>
      <AnimatePresence>
        {impersonateUser && <ImpersonateModal user={impersonateUser} onClose={() => setImpersonateUser(null)} />}
      </AnimatePresence>
    </div>
  )
}

function UserDetailPanel({ userId, onClose, onImpersonate }) {
  const [tab, setTab] = useState('profiel')
  const [data, setData] = useState(null)
  const [activityFilter, setActivityFilter] = useState('alle')

  useEffect(() => { db.adminGetUserDetail(userId).then(setData).catch(e => showToast(e.message, 'error')) }, [userId])

  const activity = data?.activity.filter(e => activityFilter === 'alle' || e.event_type === activityFilter) || []

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(2px)' }} />
      <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.8 }}
        style={{ position: 'relative', width: 480, maxWidth: '100vw', height: '100%', background: 'var(--surface)', borderLeft: '1px solid var(--border-default)', overflowY: 'auto', color: 'var(--text-primary)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{data?.profile.full_name || 'Gebruiker'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted-tok)' }}>{data?.profile.email}</div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted-tok)', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
        {!data ? <div style={{ padding: 24, color: 'var(--text-muted-tok)', fontSize: 13 }}>Laden…</div> : (
          <div style={{ padding: 20 }}>
            <div className="admin-tabs">
              {[['profiel', 'Profiel'], ['werkruimtes', 'Werkruimtes'], ['activiteit', 'Activiteit'], ['impersonation', 'Impersonation log']].map(([k, l]) => (
                <button key={k} className={`admin-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>

            {tab === 'profiel' && (
              <div style={{ fontSize: 13 }}>
                <Row label="Aangemaakt" value={fdate(data.profile.created_at?.slice(0, 10))} />
                <Row label="Laatste login" value={timeAgo(data.profile.last_sign_in_at)} />
                <Row label="Totaal aantal logins" value={data.profile.totalLogins} />
                <Row label="Meest bezochte pagina" value={data.profile.mostVisitedPage || '—'} />
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted-tok)', textTransform: 'uppercase', marginBottom: 8 }}>Gebruikte features</div>
                  {!data.profile.featuresUsed.length ? <div style={{ color: 'var(--text-muted-tok)' }}>Nog geen acties gelogd.</div> :
                    data.profile.featuresUsed.map(f => <span key={f} className="admin-badge" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)', marginRight: 6, marginBottom: 6 }}>{f}</span>)}
                </div>
                <button className="admin-btn admin-btn-danger" style={{ marginTop: 20 }} onClick={() => onImpersonate({ id: data.profile.id, email: data.profile.email, full_name: data.profile.full_name })}>Login als {data.profile.full_name || data.profile.email}</button>
              </div>
            )}

            {tab === 'werkruimtes' && (
              !data.workspaces.length ? <div style={{ color: 'var(--text-muted-tok)', fontSize: 13 }}>Geen werkruimtes.</div> : data.workspaces.map(w => (
                <div key={w.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--bg-subtle)' }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{w.name} <span style={{ fontSize: 10, color: 'var(--text-muted-tok)' }}>· {w.role}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted-tok)' }}>{w.clientCount} klanten · {w.projectCount} projecten · sinds {fdate(w.created_at?.slice(0, 10))}</div>
                </div>
              ))
            )}

            {tab === 'activiteit' && (
              <div>
                <select className="admin-input" style={{ marginBottom: 12, width: '100%' }} value={activityFilter} onChange={e => setActivityFilter(e.target.value)}>
                  <option value="alle">Alle types</option>
                  <option value="page_view">Pagina bezoeken</option>
                  <option value="action">Acties</option>
                  <option value="login">Login</option>
                  <option value="logout">Logout</option>
                </select>
                {!activity.length ? <div style={{ color: 'var(--text-muted-tok)', fontSize: 13 }}>Geen activiteit.</div> : activity.map(e => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--bg-subtle)', fontSize: 12 }}>
                    <span>{e.event_type === 'page_view' ? '👁' : e.event_type === 'login' ? '🔑' : e.event_type === 'logout' ? '🚪' : '⚡'} {e.event_name}</span>
                    <span style={{ color: 'var(--text-muted-tok)' }}>{timeAgo(e.created_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === 'impersonation' && (
              !data.impersonationLog.length ? <div style={{ color: 'var(--text-muted-tok)', fontSize: 13 }}>Nooit geïmpersoneerd.</div> : data.impersonationLog.map(l => (
                <div key={l.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--bg-subtle)', fontSize: 12 }}>
                  <div>{fdate(l.created_at?.slice(0, 10))} · door {l.admin_email}</div>
                  {l.reason && <div style={{ color: 'var(--text-secondary)' }}>"{l.reason}"</div>}
                  <div style={{ color: 'var(--text-muted-tok)' }}>{l.ended_at ? `Duur: ${Math.round((new Date(l.ended_at) - new Date(l.created_at)) / 60000)} min` : 'Nog actief / niet afgesloten'}</div>
                </div>
              ))
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}

function Row({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-subtle)' }}><span style={{ color: 'var(--text-muted-tok)' }}>{label}</span><span>{value}</span></div>
}

function ImpersonateModal({ user, onClose }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (!reason.trim()) return setError('Vul een reden in.')
    setBusy(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const result = await db.adminImpersonate(user.email, { reason: reason.trim() })
      sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, logId: result.logId }))
      const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: result.token_hash, type: 'magiclink' })
      if (verifyErr) throw verifyErr
      window.location.href = '/'
    } catch (e) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY)
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        style={{ position: 'relative', width: 420, background: 'var(--surface)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 24, color: 'var(--text-primary)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Inloggen als {user.full_name || user.email}</h3>
        <div style={{ background: 'var(--warning-subtle)33', border: '1px solid var(--warning)55', color: 'var(--warning)', borderRadius: 8, padding: '10px 12px', fontSize: 12, marginBottom: 16 }}>
          Je logt in als deze gebruiker. Al je acties worden gelogd.
        </div>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Reden (verplicht)</label>
        <textarea className="admin-input" style={{ width: '100%', height: 70, resize: 'vertical', padding: 10 }} value={reason} onChange={e => setReason(e.target.value)} placeholder="Bijv. klantprobleem reproduceren voor ticket #123" autoFocus />
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button className="admin-btn" onClick={onClose} disabled={busy}>Annuleren</button>
          <button className="admin-btn admin-btn-danger" onClick={confirm} disabled={busy}>{busy ? 'Bezig…' : 'Bevestig en login'}</button>
        </div>
      </motion.div>
    </div>
  )
}
