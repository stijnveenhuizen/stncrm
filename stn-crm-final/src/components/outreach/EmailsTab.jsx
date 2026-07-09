import React, { useState } from 'react'
import * as db from '../../lib/db'
import { Badge, showToast, EmptyState } from '../Dashboard.jsx'

const CONFIDENCE_STYLE = {
  found: { bg: 'var(--green-soft)', color: 'var(--green-text)', label: 'gevonden' },
  guess: { bg: 'var(--amber-soft)', color: 'var(--amber-text)', label: 'gok' },
  missing: { bg: 'var(--bg2)', color: 'var(--text-muted)', label: 'niet gevonden' },
}

export default function EmailsTab({ organizationId, emails, prospectById, pendingSendId, onSchedule, onRefresh }) {
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [busyId, setBusyId] = useState(null)

  async function setStatus(id, status) {
    setBusyId(id)
    try { await db.outreachUpdateEmail(organizationId, id, { status }); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
    finally { setBusyId(null) }
  }

  async function saveEdit(id) {
    try { await db.outreachUpdateEmail(organizationId, id, { email: editValue.trim() }); setEditingId(null); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
  }

  if (!emails.length) {
    return <EmptyState icon="📧" title="Nog geen e-mails" sub="Keur eerst prospects goed en klik daar op 'Vind e-mail'." />
  }

  return (
    <div className="sc" style={{ overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
            {['Prospect', 'E-mailadres', 'Betrouwbaarheid', 'Status', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {emails.map(e => {
            const prospect = prospectById[e.prospect_id] || e.outreach_prospects
            const conf = CONFIDENCE_STYLE[e.confidence] || CONFIDENCE_STYLE.missing
            const busy = busyId === e.id
            const alreadySending = pendingSendId // er kan maar 1 tegelijk in de undo-wachtrij staan (eenvoud > queueing voor nu)
            return (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 14px', fontWeight: 500 }}>{prospect?.name || '—'}</td>
                <td style={{ padding: '12px 14px' }}>
                  {editingId === e.id ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={editValue} onChange={ev => setEditValue(ev.target.value)} style={{ height: 28, fontSize: 12 }} autoFocus />
                      <button className="btn btn-ghost btn-xs" onClick={() => saveEdit(e.id)}>Opslaan</button>
                    </div>
                  ) : (
                    <span onClick={() => { setEditingId(e.id); setEditValue(e.email || '') }} style={{ cursor: 'pointer' }} title="Klik om te bewerken">
                      {e.email || <em style={{ color: 'var(--text-faint)' }}>geen e-mail</em>}
                    </span>
                  )}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <span className="badge" style={{ background: conf.bg, color: conf.color }}>{conf.label}</span>
                </td>
                <td style={{ padding: '12px 14px' }}><Badge s={e.status === 'approved' ? 'actief' : e.status === 'rejected' ? 'gestopt' : 'concept'} /></td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    {e.status === 'pending' && e.email && <>
                      <button className="btn btn-ghost btn-xs" disabled={busy} onClick={() => setStatus(e.id, 'approved')}>Goedkeuren</button>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} disabled={busy} onClick={() => setStatus(e.id, 'rejected')}>Afwijzen</button>
                    </>}
                    {e.status === 'approved' && (
                      <button className="btn btn-primary btn-xs" disabled={alreadySending} onClick={() => onSchedule(e.prospect_id, e.id)}>
                        Verstuur
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
