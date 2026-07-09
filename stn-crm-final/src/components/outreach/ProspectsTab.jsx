import React, { useState } from 'react'
import * as db from '../../lib/db'
import { Badge, showToast, EmptyState } from '../Dashboard.jsx'

export default function ProspectsTab({ organizationId, prospects, emailsByProspect, onRefresh }) {
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  async function search(e) {
    e.preventDefault()
    if (!query.trim() || !region.trim()) return
    setSearching(true); setError('')
    try {
      const res = await db.outreachSearchPlaces(organizationId, query.trim(), region.trim())
      showToast(`${res.inserted} nieuwe prospects gevonden${res.duplicates ? ` (${res.duplicates} mogelijke duplicaten gemarkeerd)` : ''}`)
      onRefresh()
    } catch (e) { setError(e.message) }
    finally { setSearching(false) }
  }

  async function setStatus(id, status) {
    setBusyId(id)
    try { await db.outreachApproveProspect(organizationId, id, status); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
    finally { setBusyId(null) }
  }

  async function findEmail(id) {
    setBusyId(id)
    try { await db.outreachFindEmail(organizationId, id); showToast('E-mail gezocht — bekijk resultaat bij "E-mails"'); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
    finally { setBusyId(null) }
  }

  return (
    <div>
      <div className="sc" style={{ marginBottom: 16 }}>
        <div className="sc-body">
          <form onSubmit={search} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label>Zoekterm</label>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="bijv. installatiebedrijf" />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 160px' }}>
              <label>Regio</label>
              <input value={region} onChange={e => setRegion(e.target.value)} placeholder="bijv. Twente" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={searching}>{searching ? 'Zoeken…' : 'Zoek prospects'}</button>
          </form>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 10 }}>{error}</div>}
        </div>
      </div>

      {!prospects.length ? (
        <EmptyState icon="🔍" title="Nog geen prospects" sub="Zoek hierboven op zoekterm + regio om resultaten uit Google Places op te halen." />
      ) : (
        <div className="sc" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                {['Bedrijf', 'Sector', 'Website', 'Telefoon', 'Status', 'E-mail', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prospects.map(p => {
                const busy = busyId === p.id
                const emailRows = emailsByProspect[p.id] || []
                const isDup = p.duplicate_prospect_id || p.duplicate_pipeline_id
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.address}</div>
                      {isDup && (
                        <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--amber-soft)', color: 'var(--amber-text)', border: '1px solid #FDE68A', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>
                            ⚠️ Al bekend {p.duplicate_pipeline?.company || p.duplicate_pipeline?.fname ? `in Pipeline (${p.duplicate_pipeline.company || `${p.duplicate_pipeline.fname} ${p.duplicate_pipeline.lname}`})` : p.duplicate_prospect ? `als Outreach-prospect (${p.duplicate_prospect.name})` : ''}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{p.sector || '—'}</td>
                    <td style={{ padding: '12px 14px' }}>{p.website ? <a href={p.website} target="_blank" rel="noreferrer" style={{ color: 'var(--blue-text)', fontSize: 12 }}>{p.website_domain}</a> : '—'}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{p.phone || '—'}</td>
                    <td style={{ padding: '12px 14px' }}><Badge s={p.status === 'approved' ? 'actief' : p.status === 'rejected' ? 'gestopt' : 'concept'} /></td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                      {emailRows.length ? emailRows.map(e => e.email || 'niet gevonden').join(', ') : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {p.status === 'pending' && <>
                          <button className="btn btn-ghost btn-xs" disabled={busy} onClick={() => setStatus(p.id, 'approved')}>Goedkeuren</button>
                          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} disabled={busy} onClick={() => setStatus(p.id, 'rejected')}>Afwijzen</button>
                        </>}
                        {p.status === 'approved' && !emailRows.length && (
                          <button className="btn btn-ghost btn-xs" disabled={busy} onClick={() => findEmail(p.id)}>{busy ? '…' : 'Vind e-mail'}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
