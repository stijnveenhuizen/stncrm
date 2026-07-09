import React, { useState } from 'react'
import * as db from '../../lib/db'
import { showToast, EmptyState } from '../Dashboard.jsx'

const BLANK_STEP = { subject: '', body: '', wait_days_after_previous: 3, on_reply: {}, on_no_reply: {} }

// Zet een {targetIndex, stop}-object om naar de <select>-waarde en terug.
function conditionToSelectValue(cond) {
  if (!cond) return ''
  if (cond.stop) return 'stop'
  if (Number.isInteger(cond.targetIndex)) return String(cond.targetIndex)
  return ''
}
function selectValueToCondition(value) {
  if (value === 'stop') return { stop: true }
  if (value === '') return {}
  return { targetIndex: Number(value) }
}

function ConditionSelect({ label, value, onChange, steps, selfIndex, defaultLabel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 150, flexShrink: 0 }}>{label}</span>
      <select style={{ height: 28, fontSize: 12 }} value={conditionToSelectValue(value)} onChange={e => onChange(selectValueToCondition(e.target.value))}>
        <option value="">{defaultLabel}</option>
        <option value="stop">Stop flow</option>
        {steps.map((_, idx) => idx !== selfIndex && <option key={idx} value={idx}>Ga naar stap {idx + 1}</option>)}
      </select>
    </div>
  )
}

export default function FlowsTab({ organizationId, flows, templates, onRefresh }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  function openNew() { setForm({ id: null, name: '', is_active: true, steps: [{ ...BLANK_STEP, wait_days_after_previous: 0 }] }) }
  function openEdit(f) {
    const stepList = f.outreach_flow_steps
    const indexById = Object.fromEntries(stepList.map((s, i) => [s.id, i]))
    setForm({
      id: f.id, name: f.name, is_active: f.is_active,
      steps: stepList.map(s => ({
        subject: s.subject, body: s.body, wait_days_after_previous: s.wait_days_after_previous,
        on_reply: s.on_reply_stop ? { stop: true } : (s.on_reply_next_step_id ? { targetIndex: indexById[s.on_reply_next_step_id] } : {}),
        on_no_reply: s.on_no_reply_stop ? { stop: true } : (s.on_no_reply_next_step_id ? { targetIndex: indexById[s.on_no_reply_next_step_id] } : {}),
      })),
    })
  }

  function addStep() { setForm(f => f.steps.length >= 5 ? f : { ...f, steps: [...f.steps, { ...BLANK_STEP }] }) }
  function removeStep(i) { setForm(f => f.steps.length <= 1 ? f : { ...f, steps: f.steps.filter((_, idx) => idx !== i) }) }
  function updateStep(i, patch) { setForm(f => ({ ...f, steps: f.steps.map((s, idx) => idx === i ? { ...s, ...patch } : s) })) }
  function loadTemplateIntoStep(i, templateId) {
    const t = templates.find(t => t.id === templateId)
    if (!t) return
    updateStep(i, { subject: t.subject, body: t.body })
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    try { await db.outreachSaveFlow(organizationId, form); setForm(null); onRefresh(); showToast('Flow opgeslagen') }
    catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }

  async function remove(id) {
    if (!confirm('Flow verwijderen? Lopende toewijzingen aan prospects blijven bestaan maar krijgen geen nieuwe stappen meer.')) return
    setBusyId(id)
    try { await db.outreachDeleteFlow(organizationId, id); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
    finally { setBusyId(null) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nieuwe flow</button>
      </div>

      {!flows.length ? (
        <EmptyState icon="🔁" title="Nog geen flows" sub="Een flow is een reeks van max 5 mail-stappen, los van sector. Elke stap moet je apart goedkeuren bij Taken." cta={<button className="btn btn-primary" onClick={openNew}>+ Nieuwe flow</button>} />
      ) : (
        <div className="sc" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                {['Naam', 'Stappen', 'Actief', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flows.map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>{f.name}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{f.outreach_flow_steps.length}</td>
                  <td style={{ padding: '12px 14px' }}>{f.is_active ? 'Ja' : 'Nee'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(f)}>Bewerken</button>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} disabled={busyId === f.id} onClick={() => remove(f.id)}>Verwijderen</button>
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
          <div className="modal" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
            <h3>{form.id ? 'Flow bewerken' : 'Nieuwe flow'}</h3>
            <form onSubmit={save}>
              <div className="form-group">
                <label>Naam</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="bijv. Standaard 3-staps opvolging" required />
              </div>

              {/* Vaste verticale layout: elke stap-kaart verbonden met een dun
                  lijntje naar de volgende. Condities die van het standaardpad
                  afwijken krijgen een eigen tekst-chip i.p.v. een getekende
                  lijn naar een verweg-gelegen kaart. */}
              <div style={{ position: 'relative' }}>
                {form.steps.map((s, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    {i > 0 && <div style={{ width: 2, height: 14, background: 'var(--border-strong)', margin: '0 0 0 20px' }} />}
                    <div className="sc" style={{ marginBottom: 0 }}>
                      <div className="sc-head">
                        <span className="sc-title">Stap {i + 1}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {templates.length > 0 && (
                            <select style={{ width: 'auto', height: 26, fontSize: 12 }} value="" onChange={e => e.target.value && loadTemplateIntoStep(i, e.target.value)}>
                              <option value="">Laad sjabloon in…</option>
                              {templates.map(t => <option key={t.id} value={t.id}>{t.sector} — {t.subject.slice(0, 30)}</option>)}
                            </select>
                          )}
                          {form.steps.length > 1 && <button type="button" className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} onClick={() => removeStep(i)}>Verwijder stap</button>}
                        </div>
                      </div>
                      <div className="sc-body">
                        {i > 0 && (
                          <div className="form-group">
                            <label>Wachttijd na vorige stap (dagen)</label>
                            <input type="number" min="1" value={s.wait_days_after_previous} onChange={e => updateStep(i, { wait_days_after_previous: Number(e.target.value) })} style={{ width: 100 }} />
                          </div>
                        )}
                        <div className="form-group">
                          <label>Onderwerp</label>
                          <input value={s.subject} onChange={e => updateStep(i, { subject: e.target.value })} required />
                        </div>
                        <div className="form-group">
                          <label>Tekst — {'{bedrijfsnaam}'}, {'{plaats}'}, {'{sector}'}</label>
                          <textarea value={s.body} onChange={e => updateStep(i, { body: e.target.value })} style={{ minHeight: 90 }} required />
                        </div>
                      </div>
                    </div>
                    <div style={{ margin: '8px 0 0 20px', padding: '8px 0 8px 16px', borderLeft: '2px solid var(--border-strong)' }}>
                      <ConditionSelect label="↳ Als reply ontvangen" value={s.on_reply} onChange={v => updateStep(i, { on_reply: v })} steps={form.steps} selfIndex={i} defaultLabel="Standaard — flow stopt" />
                      <ConditionSelect label="↳ Als geen reply" value={s.on_no_reply} onChange={v => updateStep(i, { on_no_reply: v })} steps={form.steps} selfIndex={i} defaultLabel="Standaard — volgende stap" />
                    </div>
                  </div>
                ))}
              </div>

              {form.steps.length < 5 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={addStep} style={{ margin: '10px 0 16px' }}>+ Stap toevoegen ({form.steps.length}/5)</button>
              )}

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
