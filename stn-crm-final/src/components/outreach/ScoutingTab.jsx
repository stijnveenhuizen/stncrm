import React, { useState } from 'react'
import * as db from '../../lib/db'
import { showToast, EmptyState } from '../Dashboard.jsx'

async function runBatched(items, worker, batchSize = 3) {
  const results = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    results.push(...await Promise.allSettled(batch.map(worker)))
  }
  return results
}

// Losstaand van Prospects: dit is de werf-/beoordelingsqueue. Nieuwe
// zoekresultaten komen hier binnen als status 'pending' — pas na Goedkeuren
// verschijnen ze in de Prospects-tab (die alleen approved/rejected toont).
export default function ScoutingTab({ organizationId, prospects, onRefresh }) {
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const pending = prospects.filter(p => p.status === 'pending')

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

  async function approve(id) {
    setBusyId(id)
    try { await db.outreachApproveProspect(organizationId, id, 'approved'); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
    finally { setBusyId(null) }
  }

  // Afwijzen = direct verwijderen: een afgewezen scout heeft nog geen
  // e-mails/flows en hoeft dus niet als 'rejected' te blijven hangen.
  async function reject(id) {
    if (!confirm('Prospect afwijzen? Wordt direct verwijderd, dit kan niet ongedaan worden gemaakt.')) return
    setBusyId(id)
    try { await db.outreachDeleteProspects(organizationId, [id]); showToast('Prospect verwijderd'); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
    finally { setBusyId(null) }
  }

  function toggleOne(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const allSelected = pending.length > 0 && pending.every(p => selected.has(p.id))
  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      pending.forEach(p => allSelected ? next.delete(p.id) : next.add(p.id))
      return next
    })
  }

  async function bulkApprove() {
    const ids = [...selected]
    setBulkBusy(true)
    try {
      await runBatched(ids, id => db.outreachApproveProspect(organizationId, id, 'approved'))
      showToast(`${ids.length} prospects goedgekeurd`)
      setSelected(new Set())
      onRefresh()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBulkBusy(false) }
  }

  async function bulkReject() {
    const ids = [...selected]
    if (!confirm(`${ids.length} prospects afwijzen? Worden direct verwijderd, dit kan niet ongedaan worden gemaakt.`)) return
    setBulkBusy(true)
    try {
      await db.outreachDeleteProspects(organizationId, ids)
      showToast(`${ids.length} prospects verwijderd`)
      setSelected(new Set())
      onRefresh()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBulkBusy(false) }
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

      {selected.size > 0 && (
        <div className="sc" style={{ marginBottom: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{selected.size} geselecteerd</span>
          <button className="btn btn-ghost btn-xs" disabled={bulkBusy} onClick={bulkApprove}>Goedkeuren</button>
          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} disabled={bulkBusy} onClick={bulkReject}>Afwijzen</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>Deselecteren</button>
        </div>
      )}

      {!pending.length ? (
        <EmptyState icon="🧭" title="Niets om te beoordelen" sub="Zoek hierboven op zoekterm + regio — nieuwe resultaten verschijnen hier ter beoordeling. Eenmaal goedgekeurd verhuizen ze naar Prospects." />
      ) : (
        <div className="sc" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 14px', width: 32 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: 15, height: 15 }} />
                </th>
                {['Bedrijf', 'Sector', 'Website', 'Telefoon', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pending.map(p => {
                const busy = busyId === p.id
                const isDup = p.duplicate_prospect_id || p.duplicate_pipeline_id
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} style={{ width: 15, height: 15 }} />
                    </td>
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
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-xs" disabled={busy} onClick={() => approve(p.id)}>Goedkeuren</button>
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} disabled={busy} onClick={() => reject(p.id)}>Afwijzen</button>
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
