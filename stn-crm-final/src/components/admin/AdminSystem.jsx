import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as db from '../../lib/db'
import { fdate, showToast } from '../Dashboard.jsx'

const STATUS_META = {
  online: { icon: '✅', label: s => `Online${s.ms != null ? ` · ${s.ms}ms` : ''}` },
  error: { icon: '❌', label: s => s.error || 'Fout' },
  not_configured: { icon: '⚪', label: () => 'Niet geconfigureerd' },
}

export default function AdminSystem() {
  const [tab, setTab] = useState('health')
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Systeem &amp; Logs</h1>
      <div className="admin-tabs">
        {[['health', 'Systeemgezondheid'], ['errors', 'Error logs'], ['impersonation', 'Impersonation log']].map(([k, l]) => (
          <button key={k} className={`admin-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'health' && <HealthSection />}
      {tab === 'errors' && <ErrorsSection />}
      {tab === 'impersonation' && <ImpersonationSection />}
    </div>
  )
}

function HealthSection() {
  const [checks, setChecks] = useState(null)
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    db.adminGetHealth().then(d => setChecks(d.checks)).catch(e => setChecks([{ name: 'Fout bij laden', status: 'error', error: e.message }]))
  }, [])

  useEffect(() => {
    if (!checks) return
    if (visibleCount >= checks.length) return
    const t = setTimeout(() => setVisibleCount(v => v + 1), 100)
    return () => clearTimeout(t)
  }, [checks, visibleCount])

  return (
    <div className="admin-card" style={{ padding: 20 }}>
      {!checks ? <div style={{ color: '#71717A', fontSize: 13 }}>Checks uitvoeren…</div> : checks.slice(0, visibleCount).map((c, i) => {
        const meta = STATUS_META[c.status] || STATUS_META.error
        return (
          <motion.div key={c.name} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
            style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < checks.length - 1 ? '1px solid #232323' : 'none', fontSize: 13 }}>
            <span>{c.name}</span>
            <span>{meta.icon} {meta.label(c)}</span>
          </motion.div>
        )
      })}
      {checks && visibleCount < checks.length && <div style={{ fontSize: 12, color: '#71717A', marginTop: 8 }}>Controleren…</div>}
    </div>
  )
}

function ErrorsSection() {
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('alle')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(null)

  const refresh = () => db.adminGetErrors().then(d => setErrors(d.errors)).catch(e => showToast(e.message, 'error')).finally(() => setLoading(false))
  useEffect(() => { refresh() }, [])

  const filtered = errors.filter(e => {
    if (filter === '24u' && Date.now() - new Date(e.created_at).getTime() > 86400000) return false
    if (filter === '7d' && Date.now() - new Date(e.created_at).getTime() > 7 * 86400000) return false
    if (q && !((e.route || '') + e.error_message).toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  async function resolve(e, id) {
    e.stopPropagation()
    try { await db.adminResolveError(id); refresh() } catch (err) { showToast(err.message, 'error') }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input className="admin-input" style={{ flex: 1 }} placeholder="Zoeken op route of bericht…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="admin-input" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="alle">Alle</option>
          <option value="24u">Laatste 24u</option>
          <option value="7d">Laatste 7 dagen</option>
        </select>
      </div>
      {loading ? <div style={{ color: '#71717A', fontSize: 13 }}>Laden…</div> : (
        <div className="admin-card" style={{ overflow: 'hidden' }}>
          <table className="admin-table">
            <thead><tr><th>Tijdstip</th><th>Route</th><th>Error message</th><th>Acties</th></tr></thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className="clickable" style={{ opacity: e.resolved_at ? 0.5 : 1 }} onClick={() => setSelected(e)}>
                  <td>{fdate(e.created_at?.slice(0, 10))}</td>
                  <td>{e.route || '—'}</td>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.error_message}</td>
                  <td onClick={ev => ev.stopPropagation()}>
                    {!e.resolved_at ? <button className="admin-btn" onClick={ev => resolve(ev, e.id)}>Markeer als opgelost</button> : <span style={{ fontSize: 11, color: '#4ade80' }}>Opgelost</span>}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#71717A', padding: 24 }}>Geen errors gevonden.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <AnimatePresence>
        {selected && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelected(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)' }} />
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 4 }}
              style={{ position: 'relative', width: 640, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', background: '#111', border: '1px solid #2A2A2A', borderRadius: 12, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#F4F4F5' }}>{selected.error_message}</div>
                <button onClick={() => setSelected(null)} style={{ color: '#71717A', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
              </div>
              <div style={{ fontSize: 11, color: '#71717A', marginBottom: 12 }}>{selected.route} · {fdate(selected.created_at?.slice(0, 10))}</div>
              <pre style={{ background: '#000', color: '#4ade80', padding: 14, borderRadius: 8, fontSize: 11, fontFamily: 'var(--mono-font, monospace)', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                {selected.error_stack || '(geen stack trace)'}
              </pre>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ImpersonationSection() {
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { db.adminGetImpersonationLog().then(d => setLog(d.log)).catch(e => showToast(e.message, 'error')).finally(() => setLoading(false)) }, [])

  return loading ? <div style={{ color: '#71717A', fontSize: 13 }}>Laden…</div> : (
    <div className="admin-card" style={{ overflow: 'hidden' }}>
      <table className="admin-table">
        <thead><tr><th>Datum</th><th>Admin</th><th>Gebruiker</th><th>Reden</th><th>Duur</th><th>Werkruimte</th></tr></thead>
        <tbody>
          {log.map(l => (
            <tr key={l.id}>
              <td>{fdate(l.created_at?.slice(0, 10))}</td>
              <td>{l.admin_email}</td>
              <td>{l.target_email}</td>
              <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason || '—'}</td>
              <td>{l.ended_at ? `${Math.round((new Date(l.ended_at) - new Date(l.created_at)) / 60000)} min` : 'actief'}</td>
              <td>{l.organizations?.name || '—'}</td>
            </tr>
          ))}
          {!log.length && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#71717A', padding: 24 }}>Nog geen impersonaties.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
