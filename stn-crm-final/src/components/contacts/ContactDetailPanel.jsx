import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import * as db from '../../lib/db'
import { showToast, fdate, EmptyState } from '../Dashboard.jsx'

const STATUS_OPTIONS = ['NEW', 'CONTACTED', 'OPENED', 'CLICKED', 'REPLIED', 'CALL_SCHEDULED', 'MEETING', 'QUALIFIED', 'CUSTOMER', 'ARCHIVED']
const ACTIVITY_ICON = {
  CONTACT_CREATED: '＋', EMAIL_SENT: '✉', EMAIL_OPENED: '👁', EMAIL_CLICKED: '🔗', EMAIL_REPLIED: '↩',
  EMAIL_BOUNCED: '⚠', UNSUBSCRIBED: '✕', NOTE: '📝', CALL: '☎', MEETING: '👥',
  TASK_CREATED: '✓', TASK_COMPLETED: '✅', DEAL_CREATED: '💼', STATUS_CHANGED: '→',
}
function activityIcon(type) { return ACTIVITY_ICON[type] || (type?.startsWith('UNKNOWN:') ? '❓' : '•') }

function Panel({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ position: 'relative', width: 620, maxWidth: '100vw', height: '100%', background: 'var(--surface)', boxShadow: '-8px 0 30px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column' }}>
        {children}
      </motion.div>
    </div>
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
  return <span onClick={() => setEditing(true)} style={{ ...style, cursor: 'pointer' }} title="Klik om te bewerken">
    {value || <span style={{ color: 'var(--text-faint)' }}>{placeholder}</span>}
  </span>
}

export default function ContactDetailPanel({ contactId, organizationId, onClose, onRefresh }) {
  const [contact, setContact] = useState(null)
  const [tab, setTab] = useState('timeline')
  const [activities, setActivities] = useState([])
  const [tasks, setTasks] = useState([])
  const [pipelines, setPipelines] = useState([])

  const load = useCallback(async () => {
    try {
      const [c, a, t, pls] = await Promise.all([
        db.getContact(contactId), db.getContactActivities(contactId), db.getContactTasks(contactId), db.getPipelines(organizationId),
      ])
      setContact(c); setActivities(a); setTasks(t); setPipelines(pls)
    } catch (e) { showToast('Fout bij laden: ' + e.message, 'error') }
  }, [contactId, organizationId])
  useEffect(() => { load() }, [load])

  async function saveField(field, val) {
    try { const updated = await db.updateContact(contactId, { [field]: val }); setContact(c => ({ ...c, ...updated })); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
  }
  async function changeStatus(e) {
    const status = e.target.value
    try {
      await db.updateContact(contactId, { status })
      await db.createContactActivity({ contact_id: contactId, type: 'STATUS_CHANGED', title: `Status gewijzigd naar ${status}` })
      setContact(c => ({ ...c, status }))
      load(); onRefresh()
    } catch (e) { showToast(e.message, 'error') }
  }

  async function createDeal() {
    const pipeline = pipelines.find(p => p.is_default) || pipelines[0]
    const stage = pipeline?.pipeline_stages?.slice().sort((a, b) => a.sort_order - b.sort_order)[0]
    if (!pipeline || !stage) return showToast('Geen pipeline gevonden om de deal in te plaatsen.', 'error')
    try {
      await db.createProspect({
        organization_id: organizationId, contact_id: contactId, pipeline_id: pipeline.id, stage_id: stage.id, win_probability: stage.win_probability,
        fname: contact.contact_name || contact.company || 'Onbekend', lname: '', company: contact.company || null,
        email: contact.email || null, phone: contact.phone || null, source: 'Contact',
      })
      await db.createContactActivity({ contact_id: contactId, type: 'DEAL_CREATED', title: 'Deal aangemaakt' })
      showToast('Deal aangemaakt — te vinden in Pipeline')
      load(); onRefresh()
    } catch (e) { showToast(e.message, 'error') }
  }

  if (!contact) return null

  return (
    <Panel onClose={onClose}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <EditableText value={contact.company} onSave={v => saveField('company', v)} placeholder="Bedrijfsnaam"
              style={{ fontFamily: 'var(--heading-font)', fontSize: 18, fontWeight: 700, display: 'block' }} />
            <EditableText value={contact.contact_name} onSave={v => saveField('contact_name', v)} placeholder="Contactpersoon"
              style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginTop: 2 }} />
          </div>
          <button onClick={onClose} aria-label="Sluiten" style={{ fontSize: 20, color: 'var(--text-faint)', cursor: 'pointer', flexShrink: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <EditableText value={contact.email} onSave={v => saveField('email', v)} placeholder="e-mailadres" style={{ fontSize: 12 }} />
          <EditableText value={contact.phone} onSave={v => saveField('phone', v)} placeholder="telefoon" style={{ fontSize: 12 }} />
          <EditableText value={contact.website} onSave={v => saveField('website', v)} placeholder="website" style={{ fontSize: 12 }} />
          <EditableText value={contact.city} onSave={v => saveField('city', v)} placeholder="plaats" style={{ fontSize: 12 }} />
          <EditableText value={contact.sector} onSave={v => saveField('sector', v)} placeholder="sector" style={{ fontSize: 12 }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <select value={contact.status} onChange={changeStatus} style={{ height: 28, fontSize: 12, width: 'auto' }}>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="badge bg-blue">Leadscore: {contact.leadscore}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {contact.phone && <a className="btn btn-ghost btn-sm" href={`tel:${contact.phone}`}>☎ Bel</a>}
          {contact.email && <a className="btn btn-ghost btn-sm" href={`mailto:${contact.email}`}>✉ Email</a>}
          {contact.website && <a className="btn btn-ghost btn-sm" href={contact.website.match(/^https?:\/\//i) ? contact.website : `https://${contact.website}`} target="_blank" rel="noreferrer">🌐 Website</a>}
          <button className="btn btn-ghost btn-sm" onClick={() => setTab('taken')}>+ Nieuwe taak</button>
          <button className="btn btn-primary btn-sm" onClick={createDeal}>+ Nieuwe deal</button>
        </div>
      </div>

      <div className="tabs" style={{ margin: '14px 24px 0' }}>
        {[['timeline', 'Timeline'], ['taken', 'Taken'], ['notities', 'Notities'], ['deals', 'Deals']].map(([t, label]) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
        {tab === 'timeline' && <TimelineTab activities={activities} />}
        {tab === 'taken' && <TasksTab contactId={contactId} organizationId={organizationId} tasks={tasks} onRefresh={load} />}
        {tab === 'notities' && <NotesTab contact={contact} onSave={v => saveField('notes', v)} />}
        {tab === 'deals' && <DealsTab deals={contact.pipeline || []} />}
      </div>
    </Panel>
  )
}

function TimelineTab({ activities }) {
  if (!activities.length) return <EmptyState icon="🕐" title="Nog geen activiteit" sub="Zodra er mails verstuurd/geopend worden of je iets logt, verschijnt het hier." />
  return (
    <div>
      {activities.map(a => (
        <div key={a.id} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
            {activityIcon(a.type)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{a.title}</div>
            {a.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{a.description}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{fdate(a.created_at?.slice(0, 10))}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TasksTab({ contactId, organizationId, tasks, onRefresh }) {
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)

  async function add(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await db.createContactTask({ organization_id: organizationId, contact_id: contactId, title: title.trim(), deadline: deadline || null })
      setTitle(''); setDeadline(''); onRefresh()
    } catch (e) { showToast(e.message, 'error') }
    finally { setSaving(false) }
  }
  async function toggleDone(task) {
    try { await db.updateContactTask(task.id, { status: task.status === 'done' ? 'open' : 'done' }); onRefresh() }
    catch (e) { showToast(e.message, 'error') }
  }
  async function remove(id) {
    try { await db.deleteContactTask(id); onRefresh() } catch (e) { showToast(e.message, 'error') }
  }

  return (
    <div>
      <form onSubmit={add} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Nieuwe taak…" style={{ flex: 1 }} />
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ width: 140 }} />
        <button className="btn btn-primary btn-sm" disabled={saving}>+</button>
      </form>
      {!tasks.length ? <EmptyState icon="✓" title="Geen taken" sub="Voeg hierboven een taak toe." /> : tasks.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleDone(t)} style={{ width: 15, height: 15 }} />
          <div style={{ flex: 1, textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? 'var(--text-faint)' : 'inherit' }}>{t.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.deadline ? fdate(t.deadline) : ''}</div>
          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} onClick={() => remove(t.id)}>×</button>
        </div>
      ))}
    </div>
  )
}

function NotesTab({ contact, onSave }) {
  const [val, setVal] = useState(contact.notes || '')
  useEffect(() => setVal(contact.notes || ''), [contact.id])
  return (
    <div>
      <textarea value={val} onChange={e => setVal(e.target.value)} onBlur={() => { if (val !== contact.notes) onSave(val) }}
        placeholder="Notities…" style={{ width: '100%', minHeight: 200 }} />
    </div>
  )
}

function DealsTab({ deals }) {
  if (!deals.length) return <EmptyState icon="💼" title="Nog geen deals" sub="Klik op '+ Nieuwe deal' bovenaan om er een aan te maken." />
  return (
    <div>
      {deals.map(d => (
        <div key={d.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 500 }}>{d.company || d.fname}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.deal_value ? `€${d.deal_value}` : ''} {d.won_at ? '— gewonnen' : d.lost_at ? '— verloren' : ''}</div>
        </div>
      ))}
    </div>
  )
}
