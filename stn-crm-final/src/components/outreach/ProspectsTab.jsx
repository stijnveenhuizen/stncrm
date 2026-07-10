import React, { useState } from 'react'
import * as db from '../../lib/db'
import { Badge, showToast, EmptyState } from '../Dashboard.jsx'
import ImportCsvModal from './ImportCsvModal.jsx'

// Voert de worker uit voor elk item, met beperkte gelijktijdigheid (3
// tegelijk) zodat bulk-acties op tientallen prospects de website-scans /
// e-mailfinder niet allemaal in één keer afvuren.
async function runBatched(items, worker, batchSize = 3) {
  const results = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    results.push(...await Promise.allSettled(batch.map(worker)))
  }
  return results
}

export default function ProspectsTab({ organizationId, prospects, emailsByProspect, flows = [], onRefresh }) {
  const [busyId, setBusyId] = useState(null)
  const [editingEmailId, setEditingEmailId] = useState(null)
  const [editingEmailValue, setEditingEmailValue] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkSector, setBulkSector] = useState('')
  const [bulkFlowId, setBulkFlowId] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sectorFilter, setSectorFilter] = useState('all')
  const [emailFilter, setEmailFilter] = useState('all')
  const [dupFilter, setDupFilter] = useState('all')

  // Prospects toont uitsluitend beoordeelde resultaten — nieuwe/onbeoordeelde
  // (status 'pending') horen bij Scouten, niet hier.
  const reviewed = prospects.filter(p => p.status !== 'pending')
  const sectors = [...new Set(reviewed.map(p => p.sector).filter(Boolean))].sort()
  const filtered = reviewed.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (sectorFilter !== 'all' && p.sector !== sectorFilter) return false
    const hasEmail = !!(emailsByProspect[p.id]?.length)
    if (emailFilter === 'with' && !hasEmail) return false
    if (emailFilter === 'without' && hasEmail) return false
    if (dupFilter === 'dup' && !(p.duplicate_prospect_id || p.duplicate_pipeline_id)) return false
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      const hay = `${p.name} ${p.address || ''} ${p.website_domain || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const filtersActive = searchText.trim() || statusFilter !== 'all' || sectorFilter !== 'all' || emailFilter !== 'all' || dupFilter !== 'all'
  function resetFilters() { setSearchText(''); setStatusFilter('all'); setSectorFilter('all'); setEmailFilter('all'); setDupFilter('all') }

  async function findEmail(id) {
    setBusyId(id)
    try { await db.outreachFindEmail(organizationId, id); showToast('E-mail gezocht'); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
    finally { setBusyId(null) }
  }

  async function saveEmailEdit(id) {
    try { await db.outreachUpdateEmail(organizationId, id, { email: editingEmailValue.trim() }); setEditingEmailId(null); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
  }

  function toggleOne(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id))
  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      filtered.forEach(p => allFilteredSelected ? next.delete(p.id) : next.add(p.id))
      return next
    })
  }

  async function bulkSetStatus(status) {
    const ids = [...selected]
    setBulkBusy(true)
    try {
      await runBatched(ids, id => db.outreachApproveProspect(organizationId, id, status))
      showToast(`${ids.length} prospects bijgewerkt`)
      setSelected(new Set())
      onRefresh()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBulkBusy(false) }
  }

  async function bulkFindEmail() {
    const ids = [...selected].filter(id => !(emailsByProspect[id]?.length))
    const skipped = selected.size - ids.length
    if (!ids.length) { showToast('Geselecteerde prospects hebben al een e-mailadres'); return }
    setBulkBusy(true)
    try {
      const results = await runBatched(ids, id => db.outreachFindEmail(organizationId, id))
      const failed = results.filter(r => r.status === 'rejected').length
      showToast(`E-mail gezocht voor ${ids.length - failed} prospects${skipped ? ` (${skipped} overgeslagen, al bekend)` : ''}${failed ? `, ${failed} mislukt` : ''}`)
      setSelected(new Set())
      onRefresh()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBulkBusy(false) }
  }

  async function bulkAssignSector() {
    const ids = [...selected]
    if (!bulkSector.trim()) return
    setBulkBusy(true)
    try {
      await db.outreachSetProspectsSector(organizationId, ids, bulkSector.trim())
      showToast(`Sector "${bulkSector.trim()}" toegewezen aan ${ids.length} prospects`)
      setBulkSector('')
      setSelected(new Set())
      onRefresh()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBulkBusy(false) }
  }

  async function bulkStartFlow() {
    if (!bulkFlowId) return
    const ids = [...selected]
    // Per prospect het beste bruikbare adres: bij voorkeur een goedgekeurde,
    // anders het eerst gevonden/geraden adres. Prospects zonder e-mailadres
    // worden overgeslagen (server vereist een emailId).
    const targets = ids.map(id => {
      const rows = (emailsByProspect[id] || []).filter(r => r.email)
      const best = rows.find(r => r.status === 'approved') || rows[0]
      return best ? { prospectId: id, emailId: best.id } : null
    })
    const skipped = targets.filter(t => !t).length
    const todo = targets.filter(Boolean)
    if (!todo.length) { showToast('Geen van de geselecteerde prospects heeft een bruikbaar e-mailadres'); return }
    setBulkBusy(true)
    try {
      const results = await runBatched(todo, t => db.outreachStartFlow(organizationId, t.prospectId, t.emailId, bulkFlowId))
      const failed = results.filter(r => r.status === 'rejected').length
      showToast(`Flow gestart voor ${todo.length - failed} prospects${skipped ? ` (${skipped} overgeslagen, geen e-mailadres)` : ''}${failed ? `, ${failed} mislukt (mogelijk al in deze flow)` : ''}`)
      setBulkFlowId('')
      setSelected(new Set())
      onRefresh()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBulkBusy(false) }
  }

  async function bulkDelete() {
    const ids = [...selected]
    if (!confirm(`${ids.length} prospects verwijderen? Bijbehorende e-mails, flow-historie en verzendingen worden ook verwijderd. Dit kan niet ongedaan worden gemaakt.`)) return
    setBulkBusy(true)
    try {
      await db.outreachDeleteProspects(organizationId, ids)
      showToast(`${ids.length} prospects verwijderd`)
      setSelected(new Set())
      onRefresh()
    } catch (e) { showToast(e.message, 'error') }
    finally { setBulkBusy(false) }
  }

  async function deleteOne(id) {
    if (!confirm('Prospect verwijderen? Bijbehorende e-mails, flow-historie en verzendingen worden ook verwijderd.')) return
    setBusyId(id)
    try { await db.outreachDeleteProspects(organizationId, [id]); showToast('Prospect verwijderd'); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
    finally { setBusyId(null) }
  }

  return (
    <div>
      <div className="sc" style={{ marginBottom: 16 }}>
        <div className="sc-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Nieuwe prospects werf je bij <strong>Scouten</strong> — hier staan alleen al beoordeelde (goedgekeurde/afgewezen) prospects.</p>
          <button type="button" className="btn btn-ghost" onClick={() => setShowImport(true)}>Importeer CSV</button>
        </div>
      </div>

      {reviewed.length > 0 && (
        <div className="sc" style={{ marginBottom: 16 }}>
          <div className="sc-body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 220px' }}>
              <label>Zoeken</label>
              <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Bedrijf, adres of website…" />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 1 150px' }}>
              <label>Status</label>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">Alle</option>
                <option value="approved">Goedgekeurd</option>
                <option value="rejected">Afgewezen</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 1 170px' }}>
              <label>Sector</label>
              <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)}>
                <option value="all">Alle sectoren</option>
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 1 150px' }}>
              <label>E-mail</label>
              <select value={emailFilter} onChange={e => setEmailFilter(e.target.value)}>
                <option value="all">Alle</option>
                <option value="with">Met e-mail</option>
                <option value="without">Zonder e-mail</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 1 150px' }}>
              <label>Duplicaten</label>
              <select value={dupFilter} onChange={e => setDupFilter(e.target.value)}>
                <option value="all">Alle</option>
                <option value="dup">Alleen duplicaten</option>
              </select>
            </div>
            {filtersActive && <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>Filters wissen</button>}
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sc" style={{ marginBottom: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{selected.size} geselecteerd</span>
          <button className="btn btn-ghost btn-xs" disabled={bulkBusy} onClick={() => bulkSetStatus('approved')}>Goedkeuren</button>
          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} disabled={bulkBusy} onClick={() => bulkSetStatus('rejected')}>Afwijzen</button>
          <button className="btn btn-ghost btn-xs" disabled={bulkBusy} onClick={bulkFindEmail}>{bulkBusy ? 'Bezig…' : 'Vind e-mail'}</button>
          <input value={bulkSector} onChange={e => setBulkSector(e.target.value)} placeholder="Sector…" style={{ width: 130, height: 28, fontSize: 12 }} />
          <button className="btn btn-ghost btn-xs" disabled={bulkBusy || !bulkSector.trim()} onClick={bulkAssignSector}>Sector toewijzen</button>
          {flows.length > 0 && <>
            <select value={bulkFlowId} onChange={e => setBulkFlowId(e.target.value)} style={{ width: 'auto', height: 28, fontSize: 12 }}>
              <option value="">Kies flow…</option>
              {flows.filter(f => f.is_active).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button className="btn btn-primary btn-xs" disabled={bulkBusy || !bulkFlowId} onClick={bulkStartFlow}>Start flow</button>
          </>}
          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} disabled={bulkBusy} onClick={bulkDelete}>Verwijderen</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>Deselecteren</button>
        </div>
      )}

      {!reviewed.length ? (
        <EmptyState icon="🔍" title="Nog geen beoordeelde prospects" sub="Keur prospects goed bij Scouten, of importeer een CSV-bestand — ze verschijnen daarna hier." />
      ) : !filtered.length ? (
        <EmptyState icon="🔍" title="Geen prospects binnen deze filters" sub="Pas de filters aan of wis ze om alle prospects te zien." cta={<button className="btn btn-ghost btn-sm" onClick={resetFilters}>Filters wissen</button>} />
      ) : (
        <div className="sc" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{filtered.length} van {reviewed.length} prospects</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 14px', width: 32 }}>
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} style={{ width: 15, height: 15 }} />
                </th>
                {['Bedrijf', 'Sector', 'Website', 'Telefoon', 'Status', 'E-mail', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const busy = busyId === p.id
                const emailRows = emailsByProspect[p.id] || []
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
                      {p.converted_pipeline_id && (
                        <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--green-soft)', color: 'var(--green-text)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>
                          ✅ Heeft gereageerd — staat in Pipeline
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{p.sector || '—'}</td>
                    <td style={{ padding: '12px 14px' }}>{p.website ? <a href={p.website} target="_blank" rel="noreferrer" style={{ color: 'var(--blue-text)', fontSize: 12 }}>{p.website_domain}</a> : '—'}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{p.phone || '—'}</td>
                    <td style={{ padding: '12px 14px' }}><Badge s={p.status === 'approved' ? 'actief' : p.status === 'rejected' ? 'gestopt' : 'concept'} /></td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                      {!emailRows.length ? '—' : editingEmailId === emailRows[0].id ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input value={editingEmailValue} onChange={e => setEditingEmailValue(e.target.value)} style={{ height: 26, fontSize: 12 }} autoFocus />
                          <button className="btn btn-ghost btn-xs" onClick={() => saveEmailEdit(emailRows[0].id)}>Opslaan</button>
                        </div>
                      ) : (
                        <span onClick={() => { setEditingEmailId(emailRows[0].id); setEditingEmailValue(emailRows[0].email || '') }} style={{ cursor: 'pointer' }} title="Klik om te bewerken">
                          {emailRows.map(e => e.email || 'niet gevonden').join(', ')}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {p.status === 'approved' && !emailRows.length && (
                          <button className="btn btn-ghost btn-xs" disabled={busy} onClick={() => findEmail(p.id)}>{busy ? '…' : 'Vind e-mail'}</button>
                        )}
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} disabled={busy} onClick={() => deleteOne(p.id)}>Verwijderen</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <ImportCsvModal organizationId={organizationId} onClose={() => setShowImport(false)} onDone={onRefresh} />
      )}
    </div>
  )
}
