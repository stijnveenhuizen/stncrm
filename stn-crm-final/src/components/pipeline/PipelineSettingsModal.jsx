import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import * as db from '../../lib/db'
import { showToast } from '../Dashboard.jsx'

const STAGE_COLORS = ['#6b7280', '#2563eb', '#7c3aed', '#d97706', '#3db68e', '#16a34a', '#dc2626', '#db2777', '#0d9488']

export default function PipelineSettingsModal({ organizationId, pipelines, activePipelineId, onClose, onRefresh, onSwitchPipeline }) {
  const [tab, setTab] = useState('pipelines')
  const [selectedPipelineId, setSelectedPipelineId] = useState(activePipelineId)
  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId) || pipelines[0]

  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal" style={{ maxWidth: 640, maxHeight: '85vh', overflowY: 'auto' }} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }}>
        <h3>Pipeline instellingen</h3>
        <div className="tabs" style={{ marginBottom: 16 }}>
          {[['pipelines', 'Pipelines'], ['stages', 'Fases'], ['automations', 'Automatiseringen']].map(([t, label]) => (
            <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>
        {tab === 'pipelines' && <PipelinesTab organizationId={organizationId} pipelines={pipelines} activePipelineId={activePipelineId} onRefresh={onRefresh} onSwitchPipeline={onSwitchPipeline} onSelectForStages={id => { setSelectedPipelineId(id); setTab('stages') }} />}
        {tab === 'stages' && <StagesTab organizationId={organizationId} pipelines={pipelines} selectedPipelineId={selectedPipelineId} setSelectedPipelineId={setSelectedPipelineId} onRefresh={onRefresh} />}
        {tab === 'automations' && <AutomationsTab pipelines={pipelines} selectedPipelineId={selectedPipelineId} setSelectedPipelineId={setSelectedPipelineId} onRefresh={onRefresh} />}
        <div className="modal-actions"><button className="btn btn-ghost" onClick={onClose}>Sluiten</button></div>
      </motion.div>
    </div>
  )
}

function PipelinesTab({ organizationId, pipelines, activePipelineId, onRefresh, onSwitchPipeline, onSelectForStages }) {
  async function rename(p) {
    const name = window.prompt('Nieuwe naam:', p.name)
    if (!name || !name.trim()) return
    try { await db.updatePipeline(p.id, { name: name.trim() }); onRefresh() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function remove(p) {
    if (!confirm(`"${p.name}" verwijderen? Eventuele prospects in deze pipeline raken hun koppeling kwijt.`)) return
    try { await db.deletePipeline(p.id); onRefresh() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function setDefault(p) {
    try { await db.setDefaultPipeline(organizationId, p.id); onRefresh() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  return (
    <div>
      {pipelines.map(p => (
        <div key={p.id} className="info-row" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <span className="info-val" style={{ cursor: 'pointer' }} onClick={() => onSwitchPipeline(p.id)}>{p.name}</span>
            {p.is_default && <span className="badge bg-green" style={{ marginLeft: 8, fontSize: 10 }}>Standaard</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button className="btn btn-ghost btn-xs" onClick={() => onSelectForStages(p.id)}>Fases</button>
            <button className="btn btn-ghost btn-xs" onClick={() => rename(p)}>Hernoemen</button>
            {!p.is_default && <button className="btn btn-ghost btn-xs" onClick={() => setDefault(p)}>Maak standaard</button>}
            {!p.is_default && <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} onClick={() => remove(p)}>×</button>}
          </div>
        </div>
      ))}
    </div>
  )
}

function SortableStageRow({ stage, onUpdate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id })
  const style = { transform: CSS.Transform.toString(transform), transition, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }
  return (
    <div ref={setNodeRef} style={style}>
      <span {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--text-faint)', flexShrink: 0 }}>⠿</span>
      <input type="color" value={stage.color} onChange={e => onUpdate(stage.id, { color: e.target.value })} style={{ width: 30, height: 28, padding: 2, flexShrink: 0 }} />
      <input value={stage.name} onChange={e => onUpdate(stage.id, { name: e.target.value })} style={{ flex: 1, fontSize: 13 }} />
      <input type="number" min="0" max="100" value={stage.win_probability} onChange={e => onUpdate(stage.id, { win_probability: parseInt(e.target.value) || 0 })} style={{ width: 56, fontSize: 12 }} title="Win-kans %" />
      <label style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 3, textTransform: 'none', flexShrink: 0 }}><input type="checkbox" checked={!!stage.is_won} onChange={e => onUpdate(stage.id, { is_won: e.target.checked, is_lost: e.target.checked ? false : stage.is_lost })} /> Gewonnen</label>
      <label style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 3, textTransform: 'none', flexShrink: 0 }}><input type="checkbox" checked={!!stage.is_lost} onChange={e => onUpdate(stage.id, { is_lost: e.target.checked, is_won: e.target.checked ? false : stage.is_won })} /> Verloren</label>
      <button className="task-del" onClick={() => onDelete(stage)} aria-label="Fase verwijderen">×</button>
    </div>
  )
}

function StagesTab({ organizationId, pipelines, selectedPipelineId, setSelectedPipelineId, onRefresh }) {
  const pipeline = pipelines.find(p => p.id === selectedPipelineId) || pipelines[0]
  const [stages, setStages] = useState(() => [...(pipeline?.pipeline_stages || [])].sort((a, b) => a.sort_order - b.sort_order))
  useEffect(() => { setStages([...(pipeline?.pipeline_stages || [])].sort((a, b) => a.sort_order - b.sort_order)) }, [pipeline])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function updateLocal(id, patch) { setStages(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s)) }
  async function commit(id, patch) {
    updateLocal(id, patch)
    try { await db.updatePipelineStage(id, patch) } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function handleDragEnd(e) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = stages.findIndex(s => s.id === active.id)
    const newIndex = stages.findIndex(s => s.id === over.id)
    const reordered = arrayMove(stages, oldIndex, newIndex)
    setStages(reordered)
    try { await db.reorderPipelineStages(reordered); onRefresh() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function addStage() {
    try { await db.createPipelineStage(pipeline.id, { name: 'Nieuwe fase', sort_order: stages.length, win_probability: 50, color: STAGE_COLORS[stages.length % STAGE_COLORS.length] }); onRefresh() }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function removeStage(stage) {
    const fallback = stages.find(s => s.id !== stage.id)
    if (!confirm(`Fase "${stage.name}" verwijderen? Prospects hierin gaan naar "${fallback?.name || 'geen fase'}".`)) return
    try { await db.deletePipelineStage(stage.id, fallback?.id); onRefresh() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  if (!pipeline) return <div className="empty">Geen pipeline geselecteerd</div>
  return (
    <div>
      {pipelines.length > 1 && (
        <select value={pipeline.id} onChange={e => setSelectedPipelineId(e.target.value)} style={{ marginBottom: 12, width: 'auto' }}>
          {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
          {stages.map(s => <SortableStageRow key={s.id} stage={s} onUpdate={commit} onDelete={removeStage} />)}
        </SortableContext>
      </DndContext>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={addStage}>+ Fase toevoegen</button>
    </div>
  )
}

function AutomationsTab({ pipelines, selectedPipelineId, setSelectedPipelineId, onRefresh }) {
  const pipeline = pipelines.find(p => p.id === selectedPipelineId) || pipelines[0]
  const [automations, setAutomations] = useState([])
  const [creating, setCreating] = useState(false)
  const stages = [...(pipeline?.pipeline_stages || [])].sort((a, b) => a.sort_order - b.sort_order)

  useEffect(() => { if (pipeline) db.getPipelineAutomations(pipeline.id).then(setAutomations).catch(() => {}) }, [pipeline])

  async function toggle(a) {
    try { await db.updateAutomation(a.id, { is_active: !a.is_active }); setAutomations(prev => prev.map(x => x.id === a.id ? { ...x, is_active: !x.is_active } : x)) }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function remove(a) {
    if (!confirm('Automatisering verwijderen?')) return
    try { await db.deleteAutomation(a.id); setAutomations(prev => prev.filter(x => x.id !== a.id)) } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  if (!pipeline) return <div className="empty">Geen pipeline geselecteerd</div>
  return (
    <div>
      {pipelines.length > 1 && (
        <select value={pipeline.id} onChange={e => setSelectedPipelineId(e.target.value)} style={{ marginBottom: 12, width: 'auto' }}>
          {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {!automations.length && !creating && <div className="empty">Nog geen automatiseringen</div>}
      {automations.map(a => (
        <div key={a.id} className="info-row" style={{ alignItems: 'center' }}>
          <span className="info-val" style={{ flex: 1 }}>{a.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button className={a.is_active ? 'theme-toggle dark' : 'theme-toggle'} onClick={() => toggle(a)} title={a.is_active ? 'Actief' : 'Inactief'}><div className="theme-toggle-knob"></div></button>
            <button className="task-del" onClick={() => remove(a)} aria-label="Verwijderen">×</button>
          </div>
        </div>
      ))}
      {!creating
        ? <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setCreating(true)}>+ Nieuwe automatisering</button>
        : <AutomationBuilder pipeline={pipeline} stages={stages} onCancel={() => setCreating(false)} onSaved={a => { setAutomations(prev => [...prev, a]); setCreating(false) }} />}
    </div>
  )
}

function AutomationBuilder({ pipeline, stages, onCancel, onSaved }) {
  const [name, setName] = useState('')
  const [triggerEvent, setTriggerEvent] = useState('entered_stage')
  const [triggerStageId, setTriggerStageId] = useState(stages[0]?.id || '')
  const [actionType, setActionType] = useState('create_task')
  const [taskName, setTaskName] = useState('')
  const [daysFromNow, setDaysFromNow] = useState(1)
  const [assignTo, setAssignTo] = useState('')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return showToast('Geef de automatisering een naam.', 'error')
    setSaving(true)
    try {
      const action_config = actionType === 'create_task' ? { taskName, daysFromNow, assignTo }
        : actionType === 'create_reminder' ? { text, daysFromNow }
        : { text, assignTo }
      const a = await db.createAutomation({
        pipeline_id: pipeline.id, name: name.trim(),
        trigger_event: triggerEvent, trigger_stage_id: ['entered_stage', 'left_stage'].includes(triggerEvent) ? triggerStageId : null,
        action_type: actionType, action_config, is_active: true,
      })
      showToast('Automatisering aangemaakt')
      onSaved(a)
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginTop: 10 }}>
      <div className="form-group"><label>Naam</label><input value={name} onChange={e => setName(e.target.value)} placeholder="bijv. Follow-up na offerte" /></div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 6 }}>Wanneer</div>
      <div className="form-row">
        <div className="form-group">
          <select value={triggerEvent} onChange={e => setTriggerEvent(e.target.value)}>
            <option value="entered_stage">Prospect komt in fase…</option>
            <option value="left_stage">Prospect verlaat fase…</option>
            <option value="deal_won">Deal gewonnen</option>
            <option value="deal_lost">Deal verloren</option>
          </select>
        </div>
        {['entered_stage', 'left_stage'].includes(triggerEvent) && (
          <div className="form-group">
            <select value={triggerStageId} onChange={e => setTriggerStageId(e.target.value)}>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', margin: '10px 0 6px' }}>Dan</div>
      <div className="form-group">
        <select value={actionType} onChange={e => setActionType(e.target.value)}>
          <option value="create_task">Taak aanmaken</option>
          <option value="create_reminder">Herinnering instellen</option>
          <option value="send_notification">Notificatie sturen</option>
        </select>
      </div>
      {actionType === 'create_task' && (
        <div className="form-row">
          <div className="form-group"><label>Taaknaam</label><input value={taskName} onChange={e => setTaskName(e.target.value)} /></div>
          <div className="form-group"><label>Deadline (dagen vanaf trigger)</label><input type="number" min="0" value={daysFromNow} onChange={e => setDaysFromNow(e.target.value)} /></div>
        </div>
      )}
      {actionType === 'create_reminder' && (
        <div className="form-row">
          <div className="form-group"><label>Tekst</label><input value={text} onChange={e => setText(e.target.value)} /></div>
          <div className="form-group"><label>Over X dagen</label><input type="number" min="0" value={daysFromNow} onChange={e => setDaysFromNow(e.target.value)} /></div>
        </div>
      )}
      {actionType === 'send_notification' && (
        <div className="form-group"><label>Bericht</label><input value={text} onChange={e => setText(e.target.value)} placeholder="bijv. Nieuwe deal in offertefase" /></div>
      )}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel}>Annuleren</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan en activeren'}</button>
      </div>
    </div>
  )
}
