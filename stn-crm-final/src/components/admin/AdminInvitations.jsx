import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import * as db from '../../lib/db'
import { fdate, showToast } from '../Dashboard.jsx'

const STATUS_STYLE = {
  openstaand: { bg: 'var(--warning-subtle)', color: 'var(--warning)' },
  gebruikt: { bg: 'var(--accent-subtle)', color: 'var(--success)' },
  verlopen: { bg: 'var(--bg-subtle)', color: 'var(--text-muted-tok)' },
}

export default function AdminInvitations() {
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => db.adminGetInvitations().then(d => setInvitations(d.invitations)).catch(e => setError(e.message)).finally(() => setLoading(false))
  useEffect(() => { refresh() }, [])

  async function send(e) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    try {
      await db.adminSendInvite(email.trim())
      setEmail('')
      showToast('Uitnodiging verstuurd')
      refresh()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSending(false) }
  }

  async function resend(inv) {
    try { await db.adminSendInvite(inv.email); showToast('Uitnodiging opnieuw verstuurd'); refresh() }
    catch (e) { showToast(e.message, 'error') }
  }

  async function revoke(inv) {
    if (!confirm(`Uitnodiging aan ${inv.email} intrekken?`)) return
    try { await db.adminRevokeInvite(inv.id); showToast('Uitnodiging ingetrokken'); refresh() }
    catch (e) { showToast(e.message, 'error') }
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Uitnodigingen</h1>

      <div className="admin-card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Nieuwe uitnodiging versturen</div>
        <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
          <input className="admin-input" style={{ flex: 1 }} type="email" placeholder="naam@bedrijf.nl" value={email} onChange={e => setEmail(e.target.value)} required />
          <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} type="submit" className="admin-btn" style={{ background: 'var(--accent)', color: '#fff', borderColor: 'transparent' }} disabled={sending}>
            {sending ? 'Versturen…' : 'Stuur uitnodiging'}
          </motion.button>
        </form>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>}
        <div style={{ fontSize: 11, color: 'var(--text-muted-tok)', marginTop: 10 }}>
          Verstuurt een uitnodiging via Supabase Auth (het standaard "Invite user"-sjabloon — pas de tekst aan via Supabase-dashboard → Authentication → Email Templates → Invite user).
        </div>
      </div>

      {loading ? <div style={{ color: 'var(--text-muted-tok)', fontSize: 13 }}>Laden…</div> : (
        <div className="admin-card" style={{ overflow: 'hidden' }}>
          <table className="admin-table">
            <thead><tr><th>E-mail</th><th>Verstuurd op</th><th>Status</th><th>Acties</th></tr></thead>
            <tbody>
              {invitations.map(inv => {
                const style = STATUS_STYLE[inv.status] || STATUS_STYLE.verlopen
                return (
                  <tr key={inv.id}>
                    <td>{inv.email}</td>
                    <td>{fdate(inv.sent_at?.slice(0, 10))}</td>
                    <td><span className="admin-badge" style={{ background: style.bg, color: style.color }}>{inv.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {inv.status !== 'gebruikt' && <button className="admin-btn" onClick={() => resend(inv)}>Opnieuw sturen</button>}
                        {inv.status !== 'gebruikt' && <button className="admin-btn admin-btn-danger" onClick={() => revoke(inv)}>Intrekken</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!invitations.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted-tok)', padding: 24 }}>Nog geen uitnodigingen verstuurd.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
