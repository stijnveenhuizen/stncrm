import React, { useState } from 'react'
import * as db from '../../lib/db'
import { showToast, EmptyState } from '../Dashboard.jsx'

const BLANK = { id: null, sector: '', subject: '', template_body: '', follow_up_subject: '', follow_up_body: '', follow_up_wait_days: 5 }

export default function TemplatesTab({ organizationId, templates, onRefresh }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  function openNew() { setForm({ ...BLANK }) }
  function openEdit(t) { setForm({ id: t.id, sector: t.sector, subject: t.subject, template_body: t.body, follow_up_subject: t.follow_up_subject || '', follow_up_body: t.follow_up_body || '', follow_up_wait_days: t.follow_up_wait_days }) }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    try { await db.outreachSaveTemplate(organizationId, form); setForm(null); onRefresh(); showToast('Sjabloon opgeslagen') }
    catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function remove(id) {
    if (!confirm('Sjabloon verwijderen?')) return
    setBusyId(id)
    try { await db.outreachDeleteTemplate(organizationId, id); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
    finally { setBusyId(null) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nieuw sjabloon</button>
      </div>

      {!templates.length ? (
        <EmptyState icon="✉️" title="Nog geen sjablonen" sub="Maak per sector een e-mailsjabloon aan met {bedrijfsnaam}, {plaats} en {sector} als placeholders." cta={<button className="btn btn-primary" onClick={openNew}>+ Nieuw sjabloon</button>} />
      ) : (
        <div className="sc" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                {['Sector', 'Onderwerp', 'Follow-up na', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>{t.sector}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{t.subject}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{t.follow_up_subject ? `${t.follow_up_wait_days} dagen` : '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t)}>Bewerken</button>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} disabled={busyId === t.id} onClick={() => remove(t.id)}>Verwijderen</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <div className="modal-bg open" onClick={() => setForm(null)}>
          <div className="modal" style={{ width: 560 }} onClick={e => e.stopPropagation()}>
            <h3>{form.id ? 'Sjabloon bewerken' : 'Nieuw sjabloon'}</h3>
            <form onSubmit={save}>
              <div className="form-group">
                <label>Sector</label>
                <input value={form.sector} onChange={e => setForm({ ...form, sector: e.target.value })} placeholder="bijv. installatiebedrijf" required />
              </div>
              <div className="form-group">
                <label>Onderwerp</label>
                <input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="bijv. Sneller nieuwe klanten voor {bedrijfsnaam}?" required />
              </div>
              <div className="form-group">
                <label>Tekst — gebruik {'{bedrijfsnaam}'}, {'{plaats}'}, {'{sector}'}</label>
                <textarea value={form.template_body} onChange={e => setForm({ ...form, template_body: e.target.value })} style={{ minHeight: 120 }} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Follow-up onderwerp (optioneel)</label>
                  <input value={form.follow_up_subject} onChange={e => setForm({ ...form, follow_up_subject: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Na hoeveel dagen?</label>
                  <input type="number" min="1" value={form.follow_up_wait_days} onChange={e => setForm({ ...form, follow_up_wait_days: Number(e.target.value) })} />
                </div>
              </div>
              <div className="form-group">
                <label>Follow-up tekst (optioneel — leeg = geen follow-up)</label>
                <textarea value={form.follow_up_body} onChange={e => setForm({ ...form, follow_up_body: e.target.value })} style={{ minHeight: 90 }} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Annuleren</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
