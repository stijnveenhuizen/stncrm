import React, { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import * as db from '../lib/db'
import { showToast, EmptyState, fdate } from './Dashboard.jsx'
import ContactDetailPanel from './contacts/ContactDetailPanel.jsx'
import ImportContactsCsvModal from './contacts/ImportContactsCsvModal.jsx'

const STATUS_STYLE = {
  NEW: { label: 'Nieuw', bg: 'var(--bg2)', color: 'var(--text-muted)' },
  CONTACTED: { label: 'Benaderd', bg: 'var(--blue-soft)', color: 'var(--blue-text)' },
  OPENED: { label: 'Geopend', bg: 'var(--blue-soft)', color: 'var(--blue-text)' },
  CLICKED: { label: 'Geklikt', bg: 'var(--blue-soft)', color: 'var(--blue-text)' },
  REPLIED: { label: 'Gereageerd', bg: 'var(--green-soft)', color: 'var(--green-text)' },
  CALL_SCHEDULED: { label: 'Belafspraak', bg: 'var(--amber-soft)', color: 'var(--amber-text)' },
  MEETING: { label: 'Afspraak', bg: 'var(--amber-soft)', color: 'var(--amber-text)' },
  QUALIFIED: { label: 'Gekwalificeerd', bg: 'var(--green-soft)', color: 'var(--green-text)' },
  CUSTOMER: { label: 'Klant', bg: 'var(--green-soft)', color: 'var(--green-text)' },
  ARCHIVED: { label: 'Gearchiveerd', bg: 'var(--bg2)', color: 'var(--text-faint)' },
}

async function runBatched(items, worker, batchSize = 3) {
  const results = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    results.push(...await Promise.allSettled(batch.map(worker)))
  }
  return results
}

export default function ContactsView({ organizationId }) {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkSector, setBulkSector] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [openContactId, setOpenContactId] = useState(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sectorFilter, setSectorFilter] = useState('all')

  const refresh = useCallback(async () => {
    if (!organizationId) return
    try { setContacts(await db.getContacts(organizationId)) }
    catch (e) { showToast('Fout bij laden: ' + e.message, 'error') }
    finally { setLoading(false) }
  }, [organizationId])
  useEffect(() => { refresh() }, [refresh])

  const sectors = [...new Set(contacts.map(c => c.sector).filter(Boolean))].sort()
  const filtered = contacts.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (sectorFilter !== 'all' && c.sector !== sectorFilter) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const hay = `${c.company || ''} ${c.contact_name || ''} ${c.email || ''} ${c.website || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id))

  function toggleOne(id) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }
  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      filtered.forEach(c => allFilteredSelected ? next.delete(c.id) : next.add(c.id))
      return next
    })
  }

  async function bulkDelete() {
    const ids = [...selected]
    if (!confirm(`${ids.length} contacten verwijderen? Gekoppelde deals/taken/tijdlijn worden ook verwijderd. Dit kan niet ongedaan gemaakt worden.`)) return
    setBulkBusy(true)
    try { await db.deleteContacts(ids); showToast(`${ids.length} contacten verwijderd`); setSelected(new Set()); refresh() }
    catch (e) { showToast(e.message, 'error') }
    finally { setBulkBusy(false) }
  }
  async function bulkAssignSector() {
    const ids = [...selected]
    if (!bulkSector.trim()) return
    setBulkBusy(true)
    try { await db.setContactsSector(ids, bulkSector.trim()); showToast(`Sector toegewezen aan ${ids.length} contacten`); setBulkSector(''); setSelected(new Set()); refresh() }
    catch (e) { showToast(e.message, 'error') }
    finally { setBulkBusy(false) }
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontFamily: 'var(--heading-font)', fontSize: 16, fontWeight: 700 }}>Contacten</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Elk bedrijf begint hier — pas bij serieuze interesse wordt er een Deal van gemaakt.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowImport(true)}>Importeer CSV</button>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Nieuw contact</button>
        </div>
      </div>

      <div className="sc" style={{ marginBottom: 16 }}>
        <div className="sc-body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 220px' }}>
            <label>Zoeken</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Bedrijf, contactpersoon, e-mail…" />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: '0 1 170px' }}>
            <label>Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">Alle</option>
              {Object.entries(STATUS_STYLE).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: '0 1 170px' }}>
            <label>Sector</label>
            <select value={sectorFilter} onChange={e => setSectorFilter(e.target.value)}>
              <option value="all">Alle sectoren</option>
              {sectors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="sc" style={{ marginBottom: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{selected.size} geselecteerd</span>
          <input value={bulkSector} onChange={e => setBulkSector(e.target.value)} placeholder="Sector…" style={{ width: 140, height: 28, fontSize: 12 }} />
          <button className="btn btn-ghost btn-xs" disabled={bulkBusy || !bulkSector.trim()} onClick={bulkAssignSector}>Sector toewijzen</button>
          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} disabled={bulkBusy} onClick={bulkDelete}>Verwijderen</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>Deselecteren</button>
        </div>
      )}

      {loading ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Laden…</div> : !filtered.length ? (
        <EmptyState icon="👥" title={contacts.length ? 'Geen contacten met deze filters' : 'Nog geen contacten'} sub={contacts.length ? 'Pas de filters aan.' : 'Voeg handmatig een contact toe, importeer een CSV, of wacht op de eerste Mailmeteor-webhook.'} cta={!contacts.length && <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Nieuw contact</button>} />
      ) : (
        <div className="sc" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 14px', width: 32 }}>
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} style={{ width: 15, height: 15 }} />
                </th>
                {['Bedrijf', 'E-mail', 'Sector', 'Status', 'Leadscore', 'Laatste activiteit', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setOpenContactId(c.id)}>
                  <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} style={{ width: 15, height: 15 }} />
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 500 }}>{c.company || '(geen bedrijfsnaam)'}</div>
                    {c.contact_name && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{c.contact_name}</div>}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{c.email || '—'}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{c.sector || '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span className="badge" style={{ background: STATUS_STYLE[c.status]?.bg, color: STATUS_STYLE[c.status]?.color }}>{STATUS_STYLE[c.status]?.label || c.status}</span>
                  </td>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{c.leadscore}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{c.last_activity_at ? fdate(c.last_activity_at.slice(0, 10)) : '—'}</td>
                  <td style={{ padding: '12px 14px' }} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport && <ImportContactsCsvModal organizationId={organizationId} onClose={() => setShowImport(false)} onDone={refresh} />}
      {showNew && <NewContactModal organizationId={organizationId} onClose={() => setShowNew(false)} onCreated={id => { refresh(); setShowNew(false); setOpenContactId(id) }} />}

      <AnimatePresence>
        {openContactId && (
          <ContactDetailPanel key={openContactId} contactId={openContactId} organizationId={organizationId}
            onClose={() => setOpenContactId(null)} onRefresh={refresh} />
        )}
      </AnimatePresence>
    </div>
  )
}

function NewContactModal({ organizationId, onClose, onCreated }) {
  const [form, setForm] = useState({ company: '', contact_name: '', email: '', phone: '', website: '', city: '', sector: '' })
  const [saving, setSaving] = useState(false)
  const f = k => e => setForm({ ...form, [k]: e.target.value })

  async function save(e) {
    e.preventDefault()
    if (!form.company.trim()) return showToast('Bedrijfsnaam is verplicht.', 'error')
    setSaving(true)
    try {
      const created = await db.createContact({ organization_id: organizationId, ...form })
      showToast('Contact aangemaakt')
      onCreated(created.id)
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <h3>Nieuw contact</h3>
        <form onSubmit={save}>
          <div className="form-group"><label>Bedrijfsnaam *</label><input value={form.company} onChange={f('company')} required /></div>
          <div className="form-group"><label>Contactpersoon</label><input value={form.contact_name} onChange={f('contact_name')} /></div>
          <div className="form-group"><label>E-mailadres</label><input type="email" value={form.email} onChange={f('email')} /></div>
          <div className="form-group"><label>Telefoon</label><input value={form.phone} onChange={f('phone')} /></div>
          <div className="form-group"><label>Website</label><input value={form.website} onChange={f('website')} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}><label>Plaats</label><input value={form.city} onChange={f('city')} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Sector</label><input value={form.sector} onChange={f('sector')} /></div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuleren</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
