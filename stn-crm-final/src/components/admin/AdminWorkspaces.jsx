import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as db from '../../lib/db'
import { fdate, money, showToast } from '../Dashboard.jsx'
import { ADMIN_SESSION_KEY } from '../../lib/constants.js'
import { supabase } from '../../lib/supabase'

export default function AdminWorkspaces() {
  const [workspaces, setWorkspaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailId, setDetailId] = useState(null)

  useEffect(() => { db.adminGetWorkspaces().then(d => setWorkspaces(d.workspaces)).catch(e => setError(e.message)).finally(() => setLoading(false)) }, [])

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Werkruimtes</h1>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {loading ? <div style={{ color: 'var(--text-muted-tok)', fontSize: 13 }}>Laden…</div> : (
        <div className="admin-card" style={{ overflow: 'hidden' }}>
          <table className="admin-table">
            <thead><tr><th>Werkruimte</th><th>Eigenaar</th><th>Gebruikers</th><th>Klanten</th><th>Projecten</th><th>Aangemaakt</th></tr></thead>
            <tbody>
              {workspaces.map(w => (
                <tr key={w.id} className="clickable" onClick={() => setDetailId(w.id)}>
                  <td style={{ fontWeight: 500 }}>{w.name || '(naamloos)'}</td>
                  <td>{w.owner}</td>
                  <td>{w.userCount}</td>
                  <td>{w.clientCount}</td>
                  <td>{w.projectCount}</td>
                  <td>{fdate(w.created_at?.slice(0, 10))}</td>
                </tr>
              ))}
              {!workspaces.length && <tr><td colSpan={6} style={{ color: 'var(--text-muted-tok)', textAlign: 'center', padding: 24 }}>Geen werkruimtes.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <AnimatePresence>
        {detailId && <WorkspaceDetailPanel organizationId={detailId} onClose={() => setDetailId(null)} />}
      </AnimatePresence>
    </div>
  )
}

function WorkspaceDetailPanel({ organizationId, onClose }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { db.adminGetWorkspaceDetail(organizationId).then(setData).catch(e => showToast(e.message, 'error')) }, [organizationId])

  async function impersonateOwner() {
    if (!data?.ownerUserId) return showToast('Deze werkruimte heeft geen eigenaar met een account.', 'error')
    const reason = window.prompt('Reden voor impersonatie (verplicht):')
    if (!reason || !reason.trim()) return
    setBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const result = await db.adminImpersonate(data.workspace.owner_email || '', { reason: reason.trim(), workspaceId: organizationId })
      sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, logId: result.logId }))
      const { error } = await supabase.auth.verifyOtp({ token_hash: result.token_hash, type: 'magiclink' })
      if (error) throw error
      window.location.href = '/'
    } catch (e) { showToast(e.message, 'error'); setBusy(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(2px)' }} />
      <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.8 }}
        style={{ position: 'relative', width: 480, maxWidth: '100vw', height: '100%', background: 'var(--surface)', borderLeft: '1px solid var(--border-default)', overflowY: 'auto', color: 'var(--text-primary)', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{data?.workspace?.name || 'Werkruimte'}</div>
          <button onClick={onClose} style={{ color: 'var(--text-muted-tok)', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
        {!data ? <div style={{ color: 'var(--text-muted-tok)', fontSize: 13 }}>Laden…</div> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <div className="admin-kpi"><div className="admin-kpi-label">Klanten</div><div className="admin-kpi-value" style={{ fontSize: 18 }}>{data.stats.clientCount}</div></div>
              <div className="admin-kpi"><div className="admin-kpi-label">Projecten</div><div className="admin-kpi-value" style={{ fontSize: 18 }}>{data.stats.projectCount}</div></div>
              <div className="admin-kpi"><div className="admin-kpi-label">Facturen</div><div className="admin-kpi-value" style={{ fontSize: 18 }}>{data.stats.invoiceCount}</div></div>
              <div className="admin-kpi"><div className="admin-kpi-label">Omzet totaal</div><div className="admin-kpi-value" style={{ fontSize: 18 }}>{money(data.stats.revenueTotal)}</div></div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted-tok)', textTransform: 'uppercase', marginBottom: 8 }}>Teamleden</div>
            {data.members.map(m => (
              <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--bg-subtle)', fontSize: 13 }}>
                <span>{m.full_name}</span><span style={{ color: 'var(--text-muted-tok)' }}>{m.role}</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--text-muted-tok)', textTransform: 'uppercase', margin: '20px 0 8px' }}>Recente activiteit</div>
            {!data.recentActivity.length ? <div style={{ color: 'var(--text-muted-tok)', fontSize: 12 }}>Geen recente activiteit.</div> : data.recentActivity.map(e => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>{e.event_name}</span><span style={{ color: 'var(--text-muted-tok)' }}>{fdate(e.created_at?.slice(0, 10))}</span>
              </div>
            ))}
            <button className="admin-btn admin-btn-danger" style={{ marginTop: 20 }} onClick={impersonateOwner} disabled={busy}>{busy ? 'Bezig…' : 'Login als eigenaar'}</button>
          </>
        )}
      </motion.div>
    </div>
  )
}
