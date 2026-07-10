import React, { useState } from 'react'
import * as db from '../../lib/db'
import { showToast, EmptyState, fdate } from '../Dashboard.jsx'
import FlowCanvasEditor from './FlowCanvasEditor.jsx'

const BLANK_STEP = { subject: '', body: '', wait_days_after_previous: 3, on_reply: {}, on_no_reply: {} }
const STATUS_LABEL = { scheduled: 'Gepland', queued: 'Wacht op verzendruimte', completed: 'Afgerond', stopped: 'Gestopt' }

export default function FlowsTab({ organizationId, flows, onRefresh }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [progressFlow, setProgressFlow] = useState(null)
  const [progressData, setProgressData] = useState([])
  const [progressLoading, setProgressLoading] = useState(false)

  function openNew() { setForm({ id: null, name: '', is_active: true, steps: [{ ...BLANK_STEP, wait_days_after_previous: 0, canvas_x: 260, canvas_y: 40 }] }) }
  function openEdit(f) {
    const stepList = f.outreach_flow_steps
    const indexById = Object.fromEntries(stepList.map((s, i) => [s.id, i]))
    setForm({
      id: f.id, name: f.name, is_active: f.is_active,
      steps: stepList.map(s => ({
        subject: s.subject, body: s.body, wait_days_after_previous: s.wait_days_after_previous,
        canvas_x: s.canvas_x, canvas_y: s.canvas_y,
        on_reply: s.on_reply_stop ? { stop: true } : (s.on_reply_next_step_id ? { targetIndex: indexById[s.on_reply_next_step_id] } : {}),
        on_no_reply: s.on_no_reply_stop ? { stop: true } : (s.on_no_reply_next_step_id ? { targetIndex: indexById[s.on_no_reply_next_step_id] } : {}),
      })),
    })
  }

  async function save(e) {
    e.preventDefault()
    // De stappen worden nu per stuk in een eigen modal bewerkt (niet allemaal
    // tegelijk zichtbaar), dus "required" op de velden zelf vangt een lege
    // stap niet meer af — expliciet checken vóór opslaan.
    const emptyIdx = form.steps.findIndex(s => !s.subject?.trim() || !s.body || !s.body.replace(/<[^>]+>/g, '').trim())
    if (emptyIdx !== -1) { showToast(`Stap ${emptyIdx + 1} mist een onderwerp of tekst.`, 'error'); return }
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

  async function openProgress(f) {
    setProgressFlow(f)
    setProgressLoading(true)
    try { const r = await db.outreachGetFlowProgress(organizationId, f.id); setProgressData(r.progress) }
    catch (e) { showToast(e.message, 'error') }
    finally { setProgressLoading(false) }
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
                      <button className="btn btn-ghost btn-xs" onClick={() => openProgress(f)}>Voortgang</button>
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
          <div className="modal" style={{ width: 820, maxWidth: '95vw' }} onClick={e => e.stopPropagation()}>
            <h3>{form.id ? 'Flow bewerken' : 'Nieuwe flow'}</h3>
            <form onSubmit={save}>
              <div className="form-group">
                <label>Naam</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="bijv. Standaard 3-staps opvolging" required />
              </div>

              <FlowCanvasEditor organizationId={organizationId} steps={form.steps} onChange={steps => setForm(f => ({ ...f, steps }))} />

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Annuleren</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {progressFlow && (
        <div className="modal-bg open" onClick={() => setProgressFlow(null)}>
          <div className="modal" style={{ width: 680 }} onClick={e => e.stopPropagation()}>
            <h3>Voortgang — {progressFlow.name}</h3>
            {progressLoading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Laden…</div>
            ) : !progressData.length ? (
              <EmptyState icon="📭" title="Nog geen prospects in deze flow" sub="Start de flow vanuit een geselecteerde prospect bij Prospects." />
            ) : (
              <div className="sc" style={{ overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                      {['Prospect', 'Stap', 'Status', 'Eerstvolgende actie', 'Reply'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {progressData.map(fs => (
                      <tr key={fs.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 500 }}>{fs.outreach_prospects?.name || '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fs.outreach_emails?.email || '—'}</div>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{fs.current_step}/{progressFlow.outreach_flow_steps.length}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className="badge">{STATUS_LABEL[fs.status] || fs.status}</span>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                          {fs.status === 'scheduled' || fs.status === 'queued' ? fdate(fs.scheduled_send_at?.slice(0, 10)) : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: fs.replied_at ? 'var(--green-text)' : 'var(--text-faint)' }}>
                          {fs.replied_at ? `✅ ${fdate(fs.replied_at.slice(0, 10))}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setProgressFlow(null)}>Sluiten</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
