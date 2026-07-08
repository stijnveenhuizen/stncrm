import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as db from '../../lib/db'
import { money, fdate, today, showToast, downloadQuotePdf } from '../Dashboard.jsx'
import { SOURCES, LOST_REASONS } from '../PipelineView.jsx'
import DuplicateProspectModal from './DuplicateProspectModal.jsx'

const ACTIVITY_ICON = { call: '☎', email: '✉', meeting: '👥', notitie: '📝', taak: '✓', fase_wisseling: '→', herinnering: '⏰', automatisering: '⚙' }

export default function ProspectPanel({ prospect, isNew, newStageId, stages, activePipelineId, organizationId, activities, companySettings, onClose, onRefresh, onRequestWonLost, onCreated }) {
  const [tab, setTab] = useState('overzicht')
  const [prefillActivity, setPrefillActivity] = useState(null)
  const [quotes, setQuotes] = useState([])

  const refreshQuotes = () => { if (prospect) db.getProspectQuotes(prospect.id).then(setQuotes).catch(() => {}) }
  useEffect(() => { refreshQuotes() }, [prospect?.id])

  if (isNew) {
    return (
      <Panel onClose={onClose}>
        <NewProspectForm organizationId={organizationId} pipelineId={activePipelineId} stageId={newStageId} stages={stages}
          onCreated={async id => { await onRefresh(); onCreated(id) }} onClose={onClose} />
      </Panel>
    )
  }

  if (!prospect) return null
  const stage = stages.find(s => s.id === prospect.stage_id)
  const hasQuote = quotes.length > 0

  return (
    <Panel onClose={onClose}>
      <PanelHeader prospect={prospect} stage={stage} stages={stages} onRefresh={onRefresh} onRequestWonLost={onRequestWonLost} onClose={onClose} />
      <div className="tabs" style={{ margin: '14px 24px 0' }}>
        {[['overzicht', 'Overzicht'], ['activiteiten', 'Activiteiten'], ['offerte', 'Offerte'], ['info', 'Info']].map(([t, label]) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
        {tab === 'overzicht' && <OverviewTab prospect={prospect} stage={stage} activities={activities} hasQuote={hasQuote} onRefresh={onRefresh} onRequestWonLost={onRequestWonLost} stages={stages} onSwitchTab={setTab} onPrefillActivity={setPrefillActivity} />}
        {tab === 'activiteiten' && <ActivitiesTab prospect={prospect} activities={activities} onRefresh={onRefresh} prefill={prefillActivity} onPrefillUsed={() => setPrefillActivity(null)} />}
        {tab === 'offerte' && <QuoteTab prospect={prospect} quotes={quotes} onRefresh={refreshQuotes} organizationId={organizationId} companySettings={companySettings} />}
        {tab === 'info' && <InfoTab prospect={prospect} stage={stage} activities={activities} hasQuote={hasQuote} onRefresh={onRefresh} />}
      </div>
    </Panel>
  )
}

function Panel({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ position: 'relative', width: 600, maxWidth: '100vw', height: '100%', background: 'var(--surface)', boxShadow: '-8px 0 30px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column' }}>
        {children}
      </motion.div>
    </div>
  )
}

function ThinkingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {[0, 1, 2].map(i => (
        <motion.span key={i} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
      ))}
    </span>
  )
}

function EditableText({ value, onSave, placeholder, style }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value || '')
  useEffect(() => setVal(value || ''), [value])
  if (editing) {
    return <input autoFocus value={val} onChange={e => setVal(e.target.value)}
      onBlur={() => { setEditing(false); if (val !== value) onSave(val) }}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
      style={{ ...style, border: '1px solid var(--accent)' }} />
  }
  return <span onClick={() => setEditing(true)} style={{ ...style, cursor: 'pointer' }} title="Klik om te bewerken">{value || <span style={{ color: 'var(--text-faint)' }}>{placeholder}</span>}</span>
}

function PanelHeader({ prospect, stage, stages, onRefresh, onRequestWonLost, onClose }) {
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  async function save(field, val) {
    try { await db.updateProspect(prospect.id, { [field]: val }); onRefresh() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function changeStage(s) {
    if (s.is_won || s.is_lost) { onRequestWonLost(prospect, s); return }
    try { await db.moveProspectToStage(prospect, s); onRefresh() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  return (
    <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <EditableText value={`${prospect.fname} ${prospect.lname}`} onSave={v => { const [fname, ...rest] = v.split(' '); save('fname', fname); save('lname', rest.join(' ') || '—') }}
            style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--heading-font)', display: 'block' }} />
          <EditableText value={prospect.company} placeholder="Bedrijfsnaam toevoegen" onSave={v => save('company', v)} style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginTop: 2 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-xs" onClick={() => setDuplicateOpen(true)}>⎘ Dupliceer</button>
          <button onClick={onClose} aria-label="Sluiten" style={{ fontSize: 20, color: 'var(--text-faint)', cursor: 'pointer', lineHeight: 1, flexShrink: 0, padding: '0 4px' }}>×</button>
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', paddingBottom: 6 }}>
        {stages.map(s => (
          <button key={s.id} onClick={() => changeStage(s)}
            style={{ fontSize: 11, whiteSpace: 'nowrap', padding: '5px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: s.id === prospect.stage_id ? 700 : 500, position: 'relative',
              color: s.id === prospect.stage_id ? '#fff' : 'var(--text-muted)' }}>
            {s.id === prospect.stage_id && <motion.span layoutId="active-stage-indicator" transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              style={{ position: 'absolute', inset: 0, borderRadius: 99, background: s.color, zIndex: -1 }} />}
            {s.id !== prospect.stage_id && <span style={{ position: 'absolute', inset: 0, borderRadius: 99, background: 'var(--bg2)', zIndex: -1 }} />}
            {s.name}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 8, marginBottom: 4 }}>
        <EditableText value={prospect.deal_value ? money(prospect.deal_value) : ''} placeholder="Waarde toevoegen"
          onSave={v => save('deal_value', parseFloat(v.replace(/[^\d.,]/g, '').replace(',', '.')) || null)}
          style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent-text)', fontFamily: 'var(--mono-font)' }} />
      </div>
      <AnimatePresence>
        {duplicateOpen && (
          <DuplicateProspectModal prospect={prospect} stages={stages} onClose={() => setDuplicateOpen(false)}
            onDone={async () => { setDuplicateOpen(false); await onRefresh(); showToast('Prospect gedupliceerd') }} />
        )}
      </AnimatePresence>
    </div>
  )
}

function OverviewTab({ prospect, stage, activities, hasQuote, onRefresh, onRequestWonLost, stages, onSwitchTab, onPrefillActivity }) {
  const upcoming = activities.filter(a => !a.is_completed && a.scheduled_at).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0]
  const recent = activities.slice(0, 3)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [nextAction, setNextAction] = useState('')
  const [nextActionLoading, setNextActionLoading] = useState(false)

  async function completeActivity(a) {
    try { await db.updateProspectActivity(a.id, { is_completed: true, completed_at: new Date().toISOString() }); onRefresh() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  const wonStage = stages.find(s => s.is_won)
  const lostStage = stages.find(s => s.is_lost)

  async function generateSummary() {
    setSummaryLoading(true)
    try {
      const { result } = await db.callPipelineAI('summary', { prospect, stage, activities, daysInStage: db.daysInStage(prospect) })
      await db.updateProspect(prospect.id, { ai_summary: result })
      onRefresh()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSummaryLoading(false) }
  }

  async function generateNextAction() {
    setNextActionLoading(true)
    try {
      const { result } = await db.callPipelineAI('next_action', { prospect, stage, activities, hasQuote, daysInStage: db.daysInStage(prospect) })
      setNextAction(result)
    } catch (e) { showToast(e.message, 'error') }
    finally { setNextActionLoading(false) }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase' }}>✨ AI samenvatting</span>
          <button className="btn btn-ghost btn-xs" onClick={generateSummary} disabled={summaryLoading}>{prospect.ai_summary ? 'Vernieuwen' : 'Genereren'}</button>
        </div>
        {summaryLoading ? (
          <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', padding: 12, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            Analyseren… <ThinkingDots />
          </div>
        ) : prospect.ai_summary ? (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', padding: 12, fontSize: 13, fontStyle: 'italic', marginBottom: 16 }}>
            {prospect.ai_summary}
          </motion.div>
        ) : <div style={{ fontSize: 12, color: 'var(--text-muted-tok)', marginBottom: 16 }}>Nog geen samenvatting gegenereerd.</div>}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', textTransform: 'uppercase' }}>💡 Aanbevolen actie</span>
          <button className="btn btn-ghost btn-xs" onClick={generateNextAction} disabled={nextActionLoading}>{nextAction ? 'Vernieuwen' : 'Genereren'}</button>
        </div>
        {nextActionLoading ? (
          <div style={{ background: 'var(--success-subtle)', border: '1px solid #BBF7D0', borderRadius: 'var(--radius-md)', padding: 12, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.2, repeat: Infinity }}>Aan het nadenken…</motion.span>
          </div>
        ) : nextAction ? (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            style={{ background: 'var(--success-subtle)', border: '1px solid #BBF7D0', borderRadius: 'var(--radius-md)', padding: 12, fontSize: 13, marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}>{nextAction}</div>
            <button className="btn btn-ghost btn-xs" onClick={() => { onPrefillActivity(nextAction); onSwitchTab('activiteiten') }}>Plan deze actie</button>
          </motion.div>
        ) : <div style={{ fontSize: 12, color: 'var(--text-muted-tok)', marginBottom: 16 }}>Nog geen aanbeveling gegenereerd.</div>}

        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 8 }}>Volgende actie</div>
        {upcoming ? (
          <div className="sc" style={{ marginBottom: 16 }}>
            <div className="sc-body" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{ACTIVITY_ICON[upcoming.type] || '•'}</span>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{upcoming.title}</div><div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fdate(upcoming.scheduled_at?.slice(0, 10))}</div></div>
              <button className="btn btn-ghost btn-xs" onClick={() => completeActivity(upcoming)}>Afgerond</button>
            </div>
          </div>
        ) : <div className="empty" style={{ marginBottom: 16 }}>Geen geplande activiteit</div>}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 8 }}>Recente activiteiten</div>
        {!recent.length ? <div className="empty">Nog geen activiteiten</div> : recent.map(a => (
          <div key={a.id} className="dl-item">
            <span>{ACTIVITY_ICON[a.type] || '•'}</span>
            <div style={{ flex: 1 }}><div style={{ fontSize: 13 }}>{a.title}</div></div>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fdate(a.created_at?.slice(0, 10))}</span>
          </div>
        ))}
        {activities.length > 3 && <span onClick={() => onSwitchTab('activiteiten')} style={{ fontSize: 12, color: 'var(--blue-text)', cursor: 'pointer' }}>Alle activiteiten bekijken →</span>}
      </div>
      <div>
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Samenvatting</span></div>
          <div className="sc-body">
            <div className="info-row"><span className="info-label">Waarde</span><span className="info-val">{prospect.deal_value ? money(prospect.deal_value) : '—'}</span></div>
            <div className="info-row"><span className="info-label">Kans</span><span className="info-val">{prospect.win_probability ?? stage?.win_probability ?? 0}%</span></div>
            <div className="info-row"><span className="info-label">Sluiting</span><span className="info-val">{prospect.expected_close_date ? fdate(prospect.expected_close_date) : '—'}</span></div>
            <div className="info-row"><span className="info-label">Bron</span><span className="info-val">{prospect.source || '—'}</span></div>
            <div className="info-row"><span className="info-label">Toegewezen</span><span className="info-val">{prospect.assignee?.full_name || '—'}</span></div>
          </div>
        </div>
        {!stage?.is_won && !stage?.is_lost && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" style={{ flex: 1, background: 'var(--green)' }} onClick={() => wonStage && onRequestWonLost(prospect, wonStage)}>Deal gewonnen</button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: 'var(--red-text)' }} onClick={() => lostStage && onRequestWonLost(prospect, lostStage)}>Afwijzen</button>
          </div>
        )}
      </div>
    </div>
  )
}

function ActivitiesTab({ prospect, activities, onRefresh, prefill, onPrefillUsed }) {
  const [open, setOpen] = useState(!!prefill)
  const [type, setType] = useState('notitie')
  const [title, setTitle] = useState(prefill || '')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (prefill) { setOpen(true); setTitle(prefill); setType('notitie'); onPrefillUsed() }
  }, [prefill])

  async function save() {
    if (!title.trim()) return showToast('Vul een titel in.', 'error')
    setSaving(true)
    try {
      await db.createProspectActivity({ prospect_id: prospect.id, type, title: title.trim(), description: description || null, scheduled_at: scheduledAt || null, is_completed: false })
      setTitle(''); setDescription(''); setScheduledAt(''); setOpen(false)
      onRefresh()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div>
      {!open
        ? <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} style={{ marginBottom: 14 }}>+ Activiteit toevoegen</button>
        : (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 14, overflow: 'hidden' }}>
            <div className="form-row">
              <div className="form-group"><label>Type</label>
                <select value={type} onChange={e => setType(e.target.value)}>
                  <option value="call">Call</option><option value="email">E-mail</option><option value="meeting">Meeting</option><option value="notitie">Notitie</option>
                </select>
              </div>
              {(type === 'call' || type === 'meeting') && <div className="form-group"><label>Datum/tijd</label><input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} /></div>}
            </div>
            <div className="form-group"><label>Titel</label><input value={title} onChange={e => setTitle(e.target.value)} autoFocus /></div>
            <div className="form-group"><label>Beschrijving (optioneel)</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
            <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setOpen(false)}>Annuleren</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button></div>
          </motion.div>
        )}
      {!activities.length ? <div className="empty">Nog geen activiteiten</div> : activities.map(a => (
        <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="dl-item" style={{ alignItems: 'flex-start' }}>
          <span style={{ fontSize: 15, marginTop: 1 }}>{ACTIVITY_ICON[a.type] || '•'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{a.title}</div>
            {a.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{a.description}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{fdate(a.created_at?.slice(0, 10))}{a.is_completed ? ' · afgerond' : ''}</div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function QuoteTab({ prospect, quotes, onRefresh: refresh, organizationId, companySettings }) {
  const [creating, setCreating] = useState(false)

  return (
    <div>
      {!quotes.length && !creating && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Offerte aanmaken</button>
        </div>
      )}
      {creating && <QuoteForm prospect={prospect} organizationId={organizationId} onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); refresh() }} />}
      {quotes.map(q => (
        <div key={q.id} className="sc" style={{ marginBottom: 12 }}>
          <div className="sc-head">
            <span className="sc-title">{q.title || q.quote_number}</span>
            <Badge2 status={q.status} />
          </div>
          <div className="sc-body">
            <div className="info-row"><span className="info-label">Nummer</span><span className="info-val">{q.quote_number}</span></div>
            <div className="info-row"><span className="info-label">Totaal</span><span className="info-val" style={{ fontWeight: 600 }}>{money(q.total || q.amount)}</span></div>
            {q.valid_until && <div className="info-row"><span className="info-label">Geldig tot</span><span className="info-val">{fdate(q.valid_until)}</span></div>}
            {q.accepted_at && <div className="info-row"><span className="info-label">Geaccepteerd</span><span className="info-val" style={{ color: 'var(--green-text)' }}>{fdate(q.accepted_at.slice(0, 10))}</span></div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-ghost btn-xs" onClick={() => downloadQuotePdf(q, prospect, companySettings)}>PDF downloaden</button>
              {q.status === 'concept' && <button className="btn btn-ghost btn-xs" onClick={async () => { await db.updateQuote(q.id, { status: 'verzonden', sent_at: new Date().toISOString() }); refresh() }}>Versturen naar klant</button>}
              {q.status === 'verzonden' && <button className="btn btn-ghost btn-xs" onClick={async () => { await db.updateQuote(q.id, { sent_at: new Date().toISOString() }); showToast('Opnieuw verstuurd') }}>Opnieuw versturen</button>}
            </div>
          </div>
        </div>
      ))}
      {quotes.length > 0 && !creating && <button className="btn btn-ghost btn-sm" onClick={() => setCreating(true)}>+ Nieuwe revisie</button>}
    </div>
  )
}

function Badge2({ status }) {
  const map = { concept: 'bg-gray', verzonden: 'bg-blue', geaccepteerd: 'bg-green', afgewezen: 'bg-red', verlopen: 'bg-amber' }
  return <span className={`badge ${map[status] || 'bg-gray'}`}>{status}</span>
}

function QuoteForm({ prospect, organizationId, onCancel, onSaved }) {
  const [title, setTitle] = useState(`Offerte ${prospect.company || prospect.fname}`)
  const [items, setItems] = useState([{ description: '', qty: 1, rate: 0 }])
  const [btw, setBtw] = useState(21)
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const subtotal = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0)
  const total = subtotal * (1 + btw / 100)

  function updateItem(i, patch) { setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it)) }
  function addItem() { setItems(prev => [...prev, { description: '', qty: 1, rate: 0 }]) }
  function removeItem(i) { setItems(prev => prev.filter((_, idx) => idx !== i)) }

  async function save(status) {
    setSaving(true)
    try {
      await db.createProspectQuote({ prospect_id: prospect.id, workspace_id: organizationId, title, items, subtotal, btw_percentage: btw, total, valid_until: validUntil || null, notes: notes || null, status, sent_at: status === 'verzonden' ? new Date().toISOString() : null })
      showToast('Offerte opgeslagen')
      onSaved()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div className="form-group"><label>Titel</label><input value={title} onChange={e => setTitle(e.target.value)} /></div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 80px 80px 24px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <input placeholder="Omschrijving" value={it.description} onChange={e => updateItem(i, { description: e.target.value })} style={{ fontSize: 12 }} />
          <input type="number" min="0" value={it.qty} onChange={e => updateItem(i, { qty: e.target.value })} style={{ fontSize: 12 }} title="Aantal/uren" />
          <input type="number" min="0" value={it.rate} onChange={e => updateItem(i, { rate: e.target.value })} style={{ fontSize: 12 }} title="Tarief" />
          <span style={{ fontSize: 12, fontFamily: 'var(--mono-font)' }}>{money((Number(it.qty) || 0) * (Number(it.rate) || 0))}</span>
          <button className="task-del" onClick={() => removeItem(i)} aria-label="Regel verwijderen">×</button>
        </div>
      ))}
      <button className="btn btn-ghost btn-xs" onClick={addItem} style={{ marginBottom: 12 }}>+ Regel</button>
      <div className="form-row">
        <div className="form-group"><label>BTW%</label><input type="number" value={btw} onChange={e => setBtw(parseFloat(e.target.value) || 0)} /></div>
        <div className="form-group"><label>Geldig tot</label><input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} /></div>
      </div>
      <div className="form-group"><label>Notities/voorwaarden</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
      <div style={{ textAlign: 'right', fontSize: 13, marginBottom: 10 }}>
        Subtotaal: {money(subtotal)} · BTW: {money(subtotal * btw / 100)} · <strong>Totaal: {money(total)}</strong>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Annuleren</button>
        <button className="btn btn-ghost" onClick={() => save('concept')} disabled={saving}>Opslaan als concept</button>
        <button className="btn btn-primary" onClick={() => save('verzonden')} disabled={saving}>Versturen naar klant</button>
      </div>
    </div>
  )
}

function InfoTab({ prospect, stage, activities = [], hasQuote, onRefresh }) {
  const [form, setForm] = useState({
    fname: prospect.fname || '', lname: prospect.lname || '', email: prospect.email || '', phone: prospect.phone || '',
    company: prospect.company || '', website: prospect.website || '', source: prospect.source || '', website_type: prospect.website_type || '',
    priority: prospect.priority || 'normaal', notes: prospect.notes || '', win_probability: prospect.win_probability ?? '', expected_close_date: prospect.expected_close_date || '',
    lost_reason: prospect.lost_reason || '',
  })
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  async function getAiWinProbability() {
    setAiLoading(true)
    try {
      const res = await db.callPipelineAI('win_probability', { prospect, stage, activities, hasQuote, daysInStage: db.daysInStage(prospect) })
      if (res.percentage != null) {
        setForm(p => ({ ...p, win_probability: res.percentage }))
        setAiResult(res)
        showToast(`✨ AI heeft de win-kans bijgewerkt naar ${res.percentage}%`)
      } else {
        showToast('AI gaf geen geldig percentage terug.', 'error')
      }
    } catch (e) { showToast(e.message, 'error') }
    finally { setAiLoading(false) }
  }

  async function save() {
    setSaving(true)
    try {
      await db.updateProspect(prospect.id, { ...form, win_probability: form.win_probability === '' ? null : parseInt(form.win_probability), expected_close_date: form.expected_close_date || null })
      onRefresh(); showToast('Opgeslagen')
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }
  async function addTag() {
    if (!tagInput.trim()) return
    const tags = Array.from(new Set([...(prospect.tags || []), tagInput.trim()]))
    try { await db.updateProspect(prospect.id, { tags }); setTagInput(''); onRefresh() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function removeTag(t) {
    try { await db.updateProspect(prospect.id, { tags: (prospect.tags || []).filter(x => x !== t) }); onRefresh() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  return (
    <div>
      <div className="form-row">
        <div className="form-group"><label>Naam</label><input value={form.fname} onChange={f('fname')} /></div>
        <div className="form-group"><label>Achternaam</label><input value={form.lname} onChange={f('lname')} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>E-mail</label><input type="email" value={form.email} onChange={f('email')} /></div>
        <div className="form-group"><label>Telefoon</label><input value={form.phone} onChange={f('phone')} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Bedrijfsnaam</label><input value={form.company} onChange={f('company')} /></div>
        <div className="form-group"><label>Website</label><input value={form.website} onChange={f('website')} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Bron</label><select value={form.source} onChange={f('source')}><option value="">—</option>{SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <div className="form-group"><label>Website type</label>
          <select value={form.website_type} onChange={f('website_type')}><option value="">—</option><option>WordPress</option><option>Webflow</option><option>Custom</option><option>Anders</option></select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Prioriteit</label><select value={form.priority} onChange={f('priority')}><option value="laag">Laag</option><option value="normaal">Midden</option><option value="hoog">Hoog</option></select></div>
        <div className="form-group">
          <label>Win-kans % (override)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="number" min="0" max="100" value={form.win_probability} onChange={f('win_probability')} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={getAiWinProbability} disabled={aiLoading} title="AI inschatting" style={{ flexShrink: 0 }}>{aiLoading ? <ThinkingDots /> : '✨'}</button>
          </div>
          {aiResult?.uitleg && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="badge" style={{ background: 'var(--purple-soft)', color: 'var(--purple-text)', marginTop: 6, display: 'block', whiteSpace: 'normal', padding: '6px 10px' }}>
              AI inschatting: {aiResult.percentage}% — {aiResult.uitleg}
            </motion.div>
          )}
        </div>
      </div>
      <div className="form-group"><label>Verwachte sluitdatum</label><input type="date" value={form.expected_close_date} onChange={f('expected_close_date')} /></div>
      {prospect.lost_at && <div className="form-group"><label>Verloren reden</label><input value={form.lost_reason} onChange={f('lost_reason')} list="lost-reasons" /><datalist id="lost-reasons">{LOST_REASONS.map(r => <option key={r} value={r} />)}</datalist></div>}
      <div className="form-group">
        <label>Tags</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {(prospect.tags || []).map(t => <span key={t} className="badge bg-gray" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{t}<span onClick={() => removeTag(t)} style={{ cursor: 'pointer' }}>×</span></span>)}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Tag toevoegen…" />
          <button className="btn btn-ghost btn-xs" onClick={addTag}>+</button>
        </div>
      </div>
      <div className="form-group"><label>Notities</label><textarea value={form.notes} onChange={f('notes')} rows={4} /></div>
      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
    </div>
  )
}

function NewProspectForm({ organizationId, pipelineId, stageId, stages, onCreated, onClose }) {
  const [form, setForm] = useState({ fname: '', lname: '', company: '', email: '', phone: '', source: SOURCES[0], deal_value: '' })
  const [saving, setSaving] = useState(false)
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))
  const stage = stages.find(s => s.id === stageId) || stages[0]

  async function save() {
    if (!form.fname.trim()) return showToast('Vul een naam in.', 'error')
    setSaving(true)
    try {
      const p = await db.createProspect({ organization_id: organizationId, pipeline_id: pipelineId, stage_id: stage?.id, win_probability: stage?.win_probability, fname: form.fname, lname: form.lname || '—', company: form.company || null, email: form.email || null, phone: form.phone || null, source: form.source, deal_value: form.deal_value ? parseFloat(form.deal_value) : null })
      db.logEvent('action', 'prospect_created', {}, organizationId)
      onCreated(p.id)
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Nieuwe prospect</h3>
        <button onClick={onClose} aria-label="Sluiten" style={{ fontSize: 20, color: 'var(--text-faint)', cursor: 'pointer' }}>×</button>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Voornaam</label><input value={form.fname} onChange={f('fname')} autoFocus /></div>
        <div className="form-group"><label>Achternaam</label><input value={form.lname} onChange={f('lname')} /></div>
      </div>
      <div className="form-group"><label>Bedrijf</label><input value={form.company} onChange={f('company')} /></div>
      <div className="form-row">
        <div className="form-group"><label>E-mail</label><input value={form.email} onChange={f('email')} /></div>
        <div className="form-group"><label>Telefoon</label><input value={form.phone} onChange={f('phone')} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Bron</label><select value={form.source} onChange={f('source')}>{SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <div className="form-group"><label>Verwachte waarde (€)</label><input type="number" value={form.deal_value} onChange={f('deal_value')} /></div>
      </div>
      <button className="btn btn-primary" style={{ width: '100%', padding: 12 }} onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Prospect aanmaken'}</button>
    </div>
  )
}
