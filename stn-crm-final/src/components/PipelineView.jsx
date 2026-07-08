import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import * as db from '../lib/db'
import { money, fdate, daysN, showToast, EmptyState, EmptyIcons } from './Dashboard.jsx'
import PipelineSettingsModal from './pipeline/PipelineSettingsModal.jsx'
import ProspectPanel from './pipeline/ProspectPanel.jsx'
import WonLostModals from './pipeline/WonLostModals.jsx'
import ListTable from './pipeline/ListTable.jsx'
import ForecastView from './pipeline/ForecastView.jsx'
import StatsView from './pipeline/StatsView.jsx'

export const SOURCES = ['LinkedIn', 'Website', 'Doorverwijzing', 'Cold outreach', 'Mailmeteor', 'Koude acquisitie', 'Referral', 'Instagram', 'Anders']
export const LOST_REASONS = ['Te duur', 'Gekozen voor concurrent', 'Geen budget', 'Geen reactie meer', 'Timing niet goed', 'Anders']
export const PRIORITY_COLORS = { hoog: 'var(--priority-high)', normaal: 'var(--priority-medium)', laag: 'var(--priority-low)' }
export const ini = p => ((p.fname || '?')[0] + (p.lname || '?')[0]).toUpperCase()
const AVC = ['av-b', 'av-g', 'av-p', 'av-a', 'av-r', 'av-t']
export const avColor = p => { const n = (p.fname || '?').charCodeAt(0) || 0; return AVC[n % AVC.length] }

export default function PipelineView({ showView, onRefresh, organizationId }) {
  const [pipelines, setPipelines] = useState([])
  const [activePipelineId, setActivePipelineId] = useState(() => { try { return localStorage.getItem('stn_pipeline_active') || null } catch (e) { return null } })
  const [prospects, setProspects] = useState([])
  const [activities, setActivities] = useState([])
  const [companySettings, setCompanySettings] = useState(null)
  const [view, setView] = useState(() => { try { return localStorage.getItem('stn_pipeline_view') || 'kanban' } catch (e) { return 'kanban' } })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detailProspectId, setDetailProspectId] = useState(null)
  const [pendingMove, setPendingMove] = useState(null) // { prospect, stage, mode: 'won'|'lost' }
  const [loading, setLoading] = useState(true)
  const [newPipelineOpen, setNewPipelineOpen] = useState(false)
  const [showSnoozed, setShowSnoozed] = useState(() => { try { return localStorage.getItem('stn_pipeline_show_snoozed') === '1' } catch (e) { return false } })

  const refreshAll = useCallback(async () => {
    if (!organizationId) return
    try {
      const woken = await db.wakeUpDueProspects(organizationId).catch(() => [])
      const [pl, pr, ac, cs] = await Promise.all([
        db.getPipelines(organizationId), db.getPipeline(organizationId), db.getAllProspectActivities(organizationId), db.getCompanySettings(organizationId).catch(() => null)
      ])
      setPipelines(pl); setProspects(pr); setActivities(ac); setCompanySettings(cs)
      setActivePipelineId(prev => {
        if (prev && pl.some(p => p.id === prev)) return prev
        return pl.find(p => p.is_default)?.id || pl[0]?.id || null
      })
      woken.forEach(p => showToast(`🔔 ${p.fname} ${p.lname} is terug uit snooze`))
    } catch (e) { showToast('Fout bij laden: ' + e.message, 'error') }
    setLoading(false)
  }, [organizationId])

  useEffect(() => { refreshAll() }, [refreshAll])
  useEffect(() => { try { if (activePipelineId) localStorage.setItem('stn_pipeline_active', activePipelineId) } catch (e) {} }, [activePipelineId])
  useEffect(() => { try { localStorage.setItem('stn_pipeline_view', view) } catch (e) {} }, [view])
  useEffect(() => { try { localStorage.setItem('stn_pipeline_show_snoozed', showSnoozed ? '1' : '0') } catch (e) {} }, [showSnoozed])

  const activePipeline = pipelines.find(p => p.id === activePipelineId)
  const stages = useMemo(() => [...(activePipeline?.pipeline_stages || [])].sort((a, b) => a.sort_order - b.sort_order), [activePipeline])
  const allPipelineProspects = useMemo(() => prospects.filter(p => p.pipeline_id === activePipelineId), [prospects, activePipelineId])
  const snoozedCount = useMemo(() => allPipelineProspects.filter(p => p.snoozed_until).length, [allPipelineProspects])
  const pipelineProspects = useMemo(() => showSnoozed ? allPipelineProspects : allPipelineProspects.filter(p => !p.snoozed_until), [allPipelineProspects, showSnoozed])
  const activityCountByProspect = useMemo(() => {
    const m = {}
    activities.forEach(a => { if (!a.is_completed) m[a.prospect_id] = (m[a.prospect_id] || 0) + 1 })
    return m
  }, [activities])

  async function handleCreatePipeline(name) {
    try {
      const pipeline = await db.createPipeline(organizationId, name)
      await refreshAll()
      setActivePipelineId(pipeline.id)
      showToast('Pipeline aangemaakt')
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  function requestStageMove(prospect, stage) {
    if (stage.id === prospect.stage_id) return
    if (stage.is_won) { setPendingMove({ prospect, stage, mode: 'won' }); return }
    if (stage.is_lost) { setPendingMove({ prospect, stage, mode: 'lost' }); return }
    performMove(prospect, stage)
  }
  async function performMove(prospect, stage, extra = {}) {
    try {
      await db.moveProspectToStage(prospect, stage, extra)
      await refreshAll()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  const detailProspect = prospects.find(p => p.id === detailProspectId)

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Laden…</div>

  return (
    <div>
      <style>{`
        .kanban-card:hover{box-shadow:var(--shadow-md);border-color:var(--border-strong)}
        .kanban-empty{border:2px dashed var(--border-default);border-radius:var(--radius-lg);padding:20px;text-align:center;font-size:12px;color:var(--text-muted-tok);cursor:pointer;transition:all 120ms ease}
        .kanban-empty:hover{border-color:var(--accent);color:var(--accent)}
      `}</style>
      <div className="topbar">
        <div className="topbar-left">
          <h2>Pipeline</h2>
          {pipelines.length > 0 && (
            <select value={activePipelineId || ''} onChange={e => setActivePipelineId(e.target.value)}>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setNewPipelineOpen(true)}>+ Nieuwe pipeline</button>
          <div className="tabs">
            {[['kanban', 'Kanban'], ['lijst', 'Lijst'], ['forecast', 'Forecast'], ['statistieken', 'Statistieken']].map(([v, label]) => (
              <button key={v} className={`tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="topbar-right">
          {snoozedCount > 0 && (
            <button className={`btn btn-sm ${showSnoozed ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowSnoozed(s => !s)}>🌙 {snoozedCount} gesnoozed</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setSettingsOpen(true)} title="Pipeline instellingen" aria-label="Pipeline instellingen">⚙</button>
        </div>
      </div>

      <div className="content">
        {!activePipeline ? (
          <EmptyState icon={EmptyIcons.pipeline} title="Pipeline is leeg" sub="Maak een pipeline aan om je sales bij te houden."
            cta={<button className="btn btn-primary btn-sm" onClick={() => setNewPipelineOpen(true)}>+ Pipeline aanmaken</button>} />
        ) : (
          <>
            {view === 'kanban' && (
              <KanbanBoard
                stages={stages} prospects={pipelineProspects} activityCounts={activityCountByProspect}
                onCardClick={p => setDetailProspectId(p.id)}
                onMove={requestStageMove}
                onCreate={stageId => setDetailProspectId('new:' + stageId)}
                organizationId={organizationId} activePipelineId={activePipelineId}
                onRefresh={refreshAll}
              />
            )}
            {view === 'lijst' && (
              <ListTable
                prospects={pipelineProspects} stages={stages} pipelines={pipelines}
                onOpen={p => setDetailProspectId(p.id)} onRefresh={refreshAll} organizationId={organizationId}
                onCreate={() => setDetailProspectId('new:' + (stages[0]?.id || ''))}
              />
            )}
            {view === 'forecast' && <ForecastView prospects={pipelineProspects} stages={stages} />}
            {view === 'statistieken' && <StatsView prospects={pipelineProspects} stages={stages} activities={activities.filter(a => pipelineProspects.some(p => p.id === a.prospect_id))} />}
          </>
        )}
      </div>

      <AnimatePresence>
        {detailProspectId && (
          <ProspectPanel
            key="panel"
            prospect={detailProspect}
            isNew={typeof detailProspectId === 'string' && detailProspectId.startsWith('new:')}
            newStageId={typeof detailProspectId === 'string' && detailProspectId.startsWith('new:') ? detailProspectId.split(':')[1] : null}
            stages={stages} activePipelineId={activePipelineId} organizationId={organizationId}
            activities={activities.filter(a => a.prospect_id === detailProspectId)}
            companySettings={companySettings}
            onClose={() => setDetailProspectId(null)}
            onRefresh={refreshAll}
            onConvert={prospect => onRefresh()}
            onRequestWonLost={(prospect, stage) => { setDetailProspectId(null); requestStageMove(prospect, stage) }}
            onCreated={id => setDetailProspectId(id)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && (
          <PipelineSettingsModal
            organizationId={organizationId} pipelines={pipelines} activePipelineId={activePipelineId}
            onClose={() => setSettingsOpen(false)} onRefresh={refreshAll} onSwitchPipeline={setActivePipelineId}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {newPipelineOpen && (
          <NewPipelineModal
            onClose={() => setNewPipelineOpen(false)}
            onCreate={async name => { setNewPipelineOpen(false); await handleCreatePipeline(name) }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingMove && (
          <WonLostModals
            pendingMove={pendingMove} organizationId={organizationId}
            onClose={() => setPendingMove(null)}
            onDone={async () => { setPendingMove(null); await refreshAll(); onRefresh() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function NewPipelineModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  async function create() {
    if (!name.trim()) return
    setSaving(true)
    await onCreate(name.trim())
    setSaving(false)
  }
  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal" style={{ maxWidth: 420 }} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }}>
        <h3>Nieuwe pipeline</h3>
        <div className="form-group">
          <label>Naam van de pipeline</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="bijv. Onderhoud leads" autoFocus onKeyDown={e => e.key === 'Enter' && create()} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Wordt aangemaakt met de 7 standaardfases (Benaderd t/m Klant gewonnen/Afgewezen) — die kun je daarna aanpassen via Pipeline instellingen.</div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" onClick={create} disabled={saving || !name.trim()}>{saving ? 'Aanmaken…' : 'Aanmaken'}</button>
        </div>
      </motion.div>
    </div>
  )
}

function KanbanColumn({ stage, prospects, activityCounts, onCardClick, onCreate, onMove, onRefresh }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const totalValue = prospects.reduce((s, p) => s + Number(p.deal_value || 0), 0)
  return (
    <div ref={setNodeRef} style={{ minWidth: 260, maxWidth: 300, flex: '0 0 280px', height: 'calc(100vh - 220px)', overflowY: 'auto', background: isOver ? 'var(--accent-subtle)' : 'transparent', borderRadius: 'var(--radius-lg)', transition: 'background .15s' }}>
      <div style={{ padding: '12px', borderBottom: `3px solid ${stage.color}`, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{stage.name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-subtle)', padding: '1px 7px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>{prospects.length}</span>
        </div>
        {totalValue > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted-tok)', fontFamily: 'var(--mono-font)', marginTop: 4 }}>{money(totalValue)}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80, padding: '0 2px' }}>
        {!prospects.length ? (
          <div onClick={() => onCreate(stage.id)} className="kanban-empty">+ Prospect toevoegen</div>
        ) : (
          <AnimatePresence initial={false}>
            {prospects.map(p => <ProspectCard key={p.id} prospect={p} stage={stage} activityCount={activityCounts[p.id] || 0} onClick={() => onCardClick(p)} onRefresh={onRefresh} />)}
          </AnimatePresence>
        )}
        {prospects.length > 0 && <button onClick={() => onCreate(stage.id)} style={{ fontSize: 12, color: 'var(--text-muted-tok)', padding: '6px 4px', cursor: 'pointer', textAlign: 'left' }}>+ Prospect</button>}
      </div>
    </div>
  )
}

const SOURCE_ICON = { LinkedIn: 'in', Website: '🌐', Doorverwijzing: '👥', 'Cold outreach': '✉', Mailmeteor: '✉', 'Koude acquisitie': '☎', Referral: '👥', Instagram: 'IG', Anders: '•' }

function ProspectCard({ prospect: p, stage, activityCount, onClick, onRefresh }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: p.id, disabled: !!p.snoozed_until })
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const overdue = p.expected_close_date && daysN(p.expected_close_date) < 0 && !p.won_at && !p.lost_at
  const rot = db.rotLevel(p, stage)
  const days = db.daysInStage(p)
  const borderColor = rot === 'heavy' ? 'var(--danger)' : rot === 'light' ? 'var(--warning)' : (PRIORITY_COLORS[p.priority] || PRIORITY_COLORS.normaal)
  const glow = rot === 'heavy' ? '0 0 0 2px rgba(220,38,38,0.15)' : rot === 'light' ? '0 0 0 2px rgba(217,119,6,0.15)' : undefined
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(2deg) scale(1.03)` : undefined,
    opacity: isDragging ? 0.95 : (p.snoozed_until ? 0.6 : 1), zIndex: isDragging ? 50 : 'auto',
    background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 12,
    cursor: p.snoozed_until ? 'default' : 'grab', boxShadow: isDragging ? '0 20px 40px rgba(0,0,0,0.15)' : (glow || 'var(--shadow-sm)'), borderLeft: `3px solid ${borderColor}`,
    transition: 'box-shadow 120ms ease, border-color 120ms ease', position: 'relative',
  }
  return (
    <motion.div
      layout layoutId={p.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: p.snoozed_until ? 0.6 : 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95, y: -8 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      style={{ marginBottom: 8 }}
    >
      <div ref={setNodeRef} className="kanban-card" style={style} {...listeners} {...attributes} onClick={onClick}>
        {p.snoozed_until && (
          <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 11, color: 'var(--text-muted-tok)', display: 'flex', alignItems: 'center', gap: 3, zIndex: 1 }}>🌙</div>
        )}
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{p.fname} {p.lname}</div>
        {p.company && <div style={{ fontSize: 12, color: 'var(--text-muted-tok)', marginBottom: 6 }}>{p.company}</div>}
        {p.snoozed_until ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted-tok)', marginTop: 6 }}>Actief op {fdate(p.snoozed_until)}</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontSize: 13, fontFamily: 'var(--mono-font)', color: 'var(--text-primary)', fontWeight: 600 }}>{p.deal_value ? money(p.deal_value) : ''}</span>
              <span className="badge bg-gray" style={{ fontSize: 10 }}>{p.win_probability ?? 0}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontSize: 11, color: overdue ? 'var(--danger)' : 'var(--text-muted-tok)', fontWeight: overdue ? 600 : 400 }}>{p.expected_close_date ? fdate(p.expected_close_date) : ''}</span>
              {p.source && <span title={p.source} style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg-subtle)', padding: '1px 5px', borderRadius: 4 }}>{SOURCE_ICON[p.source] || p.source.slice(0, 2)}</span>}
            </div>
            {rot !== 'none' && (
              <motion.div animate={rot === 'heavy' ? { opacity: [1, 0.4, 1] } : {}} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                style={{ fontSize: 11, color: rot === 'heavy' ? 'var(--danger)' : 'var(--warning)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>{rot === 'heavy' ? '🔴' : '⚠️'}</span> {days} dagen geen activiteit
              </motion.div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {p.assignee?.full_name && <span className={`avatar ${avColor(p)}`} style={{ width: 20, height: 20, fontSize: 9 }}>{p.assignee.full_name.slice(0, 2).toUpperCase()}</span>}
                {p.assignee?.full_name && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.assignee.full_name.split(' ')[0]}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {activityCount > 0 && <span style={{ fontSize: 10, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 2 }}>● {activityCount}</span>}
                <span onClick={e => { e.stopPropagation(); setSnoozeOpen(o => !o) }} style={{ fontSize: 13, cursor: 'pointer', position: 'relative' }} title="Snooze">
                  🌙
                  <AnimatePresence>
                    {snoozeOpen && <SnoozeDropdown prospect={p} onClose={() => setSnoozeOpen(false)} onRefresh={onRefresh} />}
                  </AnimatePresence>
                </span>
              </div>
            </div>
            {p.tags?.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                {p.tags.slice(0, 3).map(t => <span key={t} style={{ fontSize: 11, background: 'var(--bg-subtle)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: 'var(--radius-full)' }}>{t}</span>)}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}

const SNOOZE_OPTIONS = [
  ['Morgen', () => { const d = new Date(); d.setDate(d.getDate() + 1); return d }],
  ['Volgende week', () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d }],
  ['Over 2 weken', () => { const d = new Date(); d.setDate(d.getDate() + 14); return d }],
  ['Over 1 maand', () => { const d = new Date(); d.setMonth(d.getMonth() + 1); return d }],
]

export function SnoozeDropdown({ prospect, onClose, onRefresh }) {
  const [reason, setReason] = useState('')
  const [customDate, setCustomDate] = useState('')
  const [saving, setSaving] = useState(false)

  async function applySnooze(date) {
    setSaving(true)
    try {
      await db.snoozeProspect(prospect.id, date.toISOString(), reason)
      showToast(`Gesnoozed tot ${fdate(date.toISOString().slice(0, 10))}`)
      onRefresh()
      onClose()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 28, duration: 0.15 }}
      onClick={e => e.stopPropagation()}
      style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 220, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 12, zIndex: 20, textAlign: 'left' }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>Snooze tot...</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        {SNOOZE_OPTIONS.map(([label, getDate]) => (
          <button key={label} className="btn btn-ghost btn-xs" style={{ justifyContent: 'flex-start' }} onClick={() => applySnooze(getDate())} disabled={saving}>{label}</button>
        ))}
      </div>
      <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} style={{ fontSize: 12, marginBottom: 8, height: 28 }} />
      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reden (optioneel)" style={{ fontSize: 12, marginBottom: 8, height: 28 }} />
      <button className="btn btn-primary btn-sm" style={{ width: '100%' }} disabled={saving || !customDate} onClick={() => applySnooze(new Date(customDate))}>Snooze instellen</button>
    </motion.div>
  )
}

function KanbanBoard({ stages, prospects, activityCounts, onCardClick, onMove, onCreate, organizationId, activePipelineId, onRefresh }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  function handleDragEnd(e) {
    const { active, over } = e
    if (!over) return
    const prospect = prospects.find(p => p.id === active.id)
    const stage = stages.find(s => s.id === over.id)
    if (prospect && stage) onMove(prospect, stage)
  }
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 14 }}>
        {stages.map(stage => (
          <KanbanColumn key={stage.id} stage={stage} prospects={prospects.filter(p => p.stage_id === stage.id)} activityCounts={activityCounts} onCardClick={onCardClick} onCreate={onCreate} onMove={onMove} onRefresh={onRefresh} />
        ))}
      </div>
    </DndContext>
  )
}
