import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import * as db from '../lib/db'
import { money, fdate, daysN, showToast } from './Dashboard.jsx'
import PipelineSettingsModal from './pipeline/PipelineSettingsModal.jsx'
import ProspectPanel from './pipeline/ProspectPanel.jsx'
import WonLostModals from './pipeline/WonLostModals.jsx'
import ListTable from './pipeline/ListTable.jsx'
import ForecastView from './pipeline/ForecastView.jsx'
import StatsView from './pipeline/StatsView.jsx'

export const SOURCES = ['LinkedIn', 'Website', 'Doorverwijzing', 'Cold outreach', 'Mailmeteor', 'Koude acquisitie', 'Referral', 'Instagram', 'Anders']
export const LOST_REASONS = ['Te duur', 'Gekozen voor concurrent', 'Geen budget', 'Geen reactie meer', 'Timing niet goed', 'Anders']
export const PRIORITY_COLORS = { hoog: 'var(--red)', normaal: 'var(--amber)', laag: 'var(--text-faint)' }
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

  const refreshAll = useCallback(async () => {
    if (!organizationId) return
    try {
      const [pl, pr, ac, cs] = await Promise.all([
        db.getPipelines(organizationId), db.getPipeline(organizationId), db.getAllProspectActivities(organizationId), db.getCompanySettings(organizationId).catch(() => null)
      ])
      setPipelines(pl); setProspects(pr); setActivities(ac); setCompanySettings(cs)
      setActivePipelineId(prev => {
        if (prev && pl.some(p => p.id === prev)) return prev
        return pl.find(p => p.is_default)?.id || pl[0]?.id || null
      })
    } catch (e) { showToast('Fout bij laden: ' + e.message, 'error') }
    setLoading(false)
  }, [organizationId])

  useEffect(() => { refreshAll() }, [refreshAll])
  useEffect(() => { try { if (activePipelineId) localStorage.setItem('stn_pipeline_active', activePipelineId) } catch (e) {} }, [activePipelineId])
  useEffect(() => { try { localStorage.setItem('stn_pipeline_view', view) } catch (e) {} }, [view])

  const activePipeline = pipelines.find(p => p.id === activePipelineId)
  const stages = useMemo(() => [...(activePipeline?.pipeline_stages || [])].sort((a, b) => a.sort_order - b.sort_order), [activePipeline])
  const pipelineProspects = useMemo(() => prospects.filter(p => p.pipeline_id === activePipelineId), [prospects, activePipelineId])
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
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2>Pipeline</h2>
          {pipelines.length > 0 && (
            <select value={activePipelineId || ''} onChange={e => setActivePipelineId(e.target.value)} style={{ width: 'auto', fontSize: 13 }}>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button className="btn btn-ghost btn-xs" onClick={() => { const n = window.prompt('Naam van de nieuwe pipeline:'); if (n && n.trim()) handleCreatePipeline(n.trim()) }}>+ Nieuwe pipeline</button>
        </div>
        <div className="topbar-right">
          <div className="tabs">
            {[['kanban', 'Kanban'], ['lijst', 'Lijst'], ['forecast', 'Forecast'], ['statistieken', 'Statistieken']].map(([v, label]) => (
              <button key={v} className={`tab${view === v ? ' active' : ''}`} onClick={() => setView(v)}>{label}</button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setSettingsOpen(true)} title="Pipeline instellingen" aria-label="Pipeline instellingen">⚙</button>
        </div>
      </div>

      <div className="content">
        {!activePipeline ? (
          <div className="empty">Nog geen pipeline. Maak er een aan om te beginnen.</div>
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

function KanbanColumn({ stage, prospects, activityCounts, onCardClick, onCreate, onMove }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const totalValue = prospects.reduce((s, p) => s + Number(p.deal_value || 0), 0)
  return (
    <div ref={setNodeRef} style={{ minWidth: 264, flex: '0 0 264px', background: isOver ? 'var(--accent-soft)' : 'transparent', borderRadius: 12, transition: 'background .15s' }}>
      <div style={{ padding: '10px 10px 12px', borderTop: `3px solid ${stage.color}`, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--heading-font)' }}>{stage.name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--bg2)', padding: '1px 7px', borderRadius: 99 }}>{prospects.length}</span>
        </div>
        {totalValue > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--mono-font)', marginTop: 2 }}>{money(totalValue)}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80, padding: '0 2px' }}>
        {!prospects.length ? (
          <div onClick={() => onCreate(stage.id)} style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: '18px 10px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)', cursor: 'pointer' }}>+ Prospect toevoegen</div>
        ) : prospects.map(p => <ProspectCard key={p.id} prospect={p} stage={stage} activityCount={activityCounts[p.id] || 0} onClick={() => onCardClick(p)} />)}
        {prospects.length > 0 && <button onClick={() => onCreate(stage.id)} style={{ fontSize: 12, color: 'var(--text-faint)', padding: '6px 4px', cursor: 'pointer', textAlign: 'left' }}>+ Prospect</button>}
      </div>
    </div>
  )
}

const SOURCE_ICON = { LinkedIn: 'in', Website: '🌐', Doorverwijzing: '👥', 'Cold outreach': '✉', Mailmeteor: '✉', 'Koude acquisitie': '☎', Referral: '👥', Instagram: 'IG', Anders: '•' }

function ProspectCard({ prospect: p, activityCount, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: p.id })
  const overdue = p.expected_close_date && daysN(p.expected_close_date) < 0 && !p.won_at && !p.lost_at
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 50 : 'auto',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px 11px',
    cursor: 'grab', boxShadow: 'var(--shadow)', borderLeft: `3px solid ${PRIORITY_COLORS[p.priority] || PRIORITY_COLORS.normaal}`,
  }
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} onClick={onClick}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.fname} {p.lname}</div>
      {p.company && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{p.company}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--mono-font)', color: 'var(--accent-text)', fontWeight: 500 }}>{p.deal_value ? money(p.deal_value) : ''}</span>
        {p.source && <span title={p.source} style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--bg2)', padding: '1px 5px', borderRadius: 4 }}>{SOURCE_ICON[p.source] || p.source.slice(0, 2)}</span>}
      </div>
      {p.expected_close_date && <div style={{ fontSize: 10, marginTop: 4, color: overdue ? 'var(--red-text)' : 'var(--text-faint)', fontWeight: overdue ? 600 : 400 }}>{fdate(p.expected_close_date)}</div>}
      {p.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {p.tags.slice(0, 3).map(t => <span key={t} style={{ fontSize: 9, background: 'var(--bg2)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: 99 }}>{t}</span>)}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        {p.assignee?.full_name
          ? <span className={`avatar ${avColor(p)}`} title={p.assignee.full_name} style={{ width: 20, height: 20, fontSize: 9 }}>{p.assignee.full_name.slice(0, 2).toUpperCase()}</span>
          : <span />}
        {activityCount > 0 && <span style={{ fontSize: 10, color: 'var(--amber-text)', display: 'flex', alignItems: 'center', gap: 2 }}>● {activityCount}</span>}
      </div>
    </div>
  )
}

function KanbanBoard({ stages, prospects, activityCounts, onCardClick, onMove, onCreate, organizationId, activePipelineId }) {
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
          <KanbanColumn key={stage.id} stage={stage} prospects={prospects.filter(p => p.stage_id === stage.id)} activityCounts={activityCounts} onCardClick={onCardClick} onCreate={onCreate} onMove={onMove} />
        ))}
      </div>
    </DndContext>
  )
}
