import React, { useState, useEffect } from 'react'
import * as db from '../lib/db'

const STAGES = [
  { key: 'benaderd',  label: 'Benaderd',   color: '#6b7280' },
  { key: 'interesse', label: 'Interesse',   color: '#2563eb' },
  { key: 'gesprek',   label: 'Gesprek',     color: '#7c3aed' },
  { key: 'offerte',   label: 'Offerte',     color: '#d97706' },
  { key: 'akkoord',   label: 'Akkoord',     color: '#3db68e' },
  { key: 'klant',     label: 'Klant ✓',    color: '#16a34a' },
  { key: 'afgewezen', label: 'Afgewezen',   color: '#dc2626' },
]

const SOURCES = ['Mailmeteor','LinkedIn','Koude acquisitie','Referral','Website','Instagram','Anders']

const money = n => n ? '€\u202f' + Number(n).toLocaleString('nl-NL', {minimumFractionDigits:0,maximumFractionDigits:0}) : ''
const fdate = d => { if(!d) return '—'; return new Date(d).toLocaleDateString('nl-NL', {day:'numeric',month:'short'}) }
const today = () => new Date().toISOString().slice(0,10)
const daysN = d => { if(!d) return null; return Math.ceil((new Date(d)-new Date(today()))/86400000) }

function stageBadge(stage) {
  const s = STAGES.find(s => s.key === stage) || STAGES[0]
  return <span style={{display:'inline-flex',alignItems:'center',padding:'2px 9px',borderRadius:99,fontSize:11,fontWeight:600,background:s.color+'18',color:s.color}}>{s.label}</span>
}

function ini(p) { return ((p.fname||'?')[0]+(p.lname||'?')[0]).toUpperCase() }
const AVC=['av-b','av-g','av-p','av-a','av-r','av-t']
function avColor(p) { const n=p.fname.charCodeAt(0)||0; return AVC[n%AVC.length] }

export default function PipelineView({ showView, onRefresh, organizationId }) {
  const [pipeline, setPipeline] = useState([])
  const [openTasks, setOpenTasks] = useState([])
  const [view, setView] = useState('lijst') // lijst | kanban
  const [filterStage, setFilterStage] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editProspect, setEditProspect] = useState(null)
  const [converting, setConverting] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [taskView, setTaskView] = useState(false)

  useEffect(() => {
    db.getPipeline(organizationId).then(setPipeline)
    db.getAllPipelineTasks().then(setOpenTasks)
  }, [organizationId])
  const refresh = () => {
    db.getPipeline(organizationId).then(setPipeline)
    db.getAllPipelineTasks().then(setOpenTasks)
  }

  const filtered = filterStage === 'all'
    ? pipeline
    : pipeline.filter(p => p.stage === filterStage)

  const totalValue = pipeline.filter(p => !['afgewezen','klant'].includes(p.stage)).reduce((s,p) => s+Number(p.deal_value||0), 0)
  const wonValue = pipeline.filter(p => p.stage === 'klant').reduce((s,p) => s+Number(p.deal_value||0), 0)
  const interested = pipeline.filter(p => ['interesse','gesprek','offerte','akkoord'].includes(p.stage)).length

  async function handleConvert(prospect) {
    if (!confirm(`${prospect.fname} ${prospect.lname} omzetten naar klant?`)) return
    setConverting(prospect.id)
    try {
      const client = await db.convertToClient(prospect)
      await refresh()
      onRefresh()
      if (showView) showView('client-detail', client.id)
    } catch(e) { alert('Fout: ' + e.message) }
    finally { setConverting(null) }
  }

  async function handleStageChange(id, stage) {
    await db.updateProspect(id, { stage })
    refresh()
  }

  async function handleDrop(stage, prospectId) {
    if (!prospectId) return
    await db.updateProspect(prospectId, { stage })
    setDragging(null)
    refresh()
  }

  const followupsDue = pipeline.filter(p => p.next_followup && daysN(p.next_followup) <= 0 && !['klant','afgewezen'].includes(p.stage))

  return (
    <div>
      <div className="topbar">
        <h2>Sales Pipeline</h2>
        <div className="topbar-right">
          <div className="tabs">
            <button className={`tab${view==='lijst'?' active':''}`} onClick={() => setView('lijst')}>Lijst</button>
            <button className={`tab${view==='kanban'?' active':''}`} onClick={() => setView('kanban')}>Kanban</button>
          </div>
          <button className={`btn btn-sm ${taskView ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTaskView(!taskView)}>
            {openTasks.length > 0 && <span style={{background:'var(--red)',color:'#fff',borderRadius:99,padding:'0 5px',fontSize:10,fontWeight:700}}>{openTasks.length}</span>} Taken
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setEditProspect(null); setShowModal(true) }}>+ Prospect</button>
        </div>
      </div>

      <div className="content">
        {/* Pipeline tasks overview */}
        {taskView && (
          <div className="sc" style={{marginBottom:20}}>
            <div className="sc-head">
              <span className="sc-title">Open pipeline-taken</span>
              <span style={{fontSize:12,color:'var(--text-muted)'}}>{openTasks.length} open</span>
            </div>
            <div className="sc-body">
              {!openTasks.length ? (
                <div className="empty">Geen open taken</div>
              ) : openTasks.map(t => {
                const dd = t.due_date ? Math.ceil((new Date(t.due_date)-new Date(today()))/86400000) : null
                const prospect = t.pipeline
                return (
                  <div key={t.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                    <div
                      style={{width:17,height:17,border:'1.5px solid var(--border-strong)',borderRadius:4,flexShrink:0,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}
                      onClick={async () => { await db.updatePipelineTask(t.id,{done:true}); db.getAllPipelineTasks().then(setOpenTasks) }}
                    ></div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13}}>{t.description}</div>
                      {prospect && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:1}}>{prospect.fname} {prospect.lname}{prospect.company?' · '+prospect.company:''}</div>}
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                      {t.due_date && <span style={{fontSize:11,color:dd<0?'var(--red-text)':dd===0?'var(--amber-text)':'var(--text-faint)',fontWeight:dd<=0?600:400}}>{dd<0?Math.abs(dd)+'d te laat':dd===0?'Vandaag':fdate(t.due_date)}</span>}
                      <button style={{fontSize:14,color:'var(--text-faint)',cursor:'pointer'}} onClick={async () => { await db.deletePipelineTask(t.id); db.getAllPipelineTasks().then(setOpenTasks) }}>×</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
          <div className="stat-card"><div className="stat-label">Totaal prospects</div><div className="stat-value">{pipeline.filter(p=>p.stage!=='klant').length}</div></div>
          <div className="stat-card"><div className="stat-label">Actief in pipeline</div><div className="stat-value" style={{color:'var(--blue)'}}>{interested}</div></div>
          <div className="stat-card"><div className="stat-label">Pipeline waarde</div><div className="stat-value" style={{fontSize:18}}>{money(totalValue)}</div></div>
          <div className="stat-card"><div className="stat-label">Gewonnen</div><div className="stat-value" style={{fontSize:18,color:'var(--accent)'}}>{money(wonValue)}</div><div className="stat-sub">{pipeline.filter(p=>p.stage==='klant').length} klanten</div></div>
        </div>

        {/* Follow-up warnings */}
        {followupsDue.length > 0 && (
          <div style={{background:'var(--amber-soft)',border:'1px solid var(--amber)',borderRadius:'var(--r)',padding:'12px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:18}}>⏰</span>
            <div>
              <div style={{fontWeight:600,fontSize:13,color:'var(--amber-text)'}}>Follow-up vereist</div>
              <div style={{fontSize:12,color:'var(--amber-text)'}}>{followupsDue.map(p => p.fname+' '+p.lname).join(', ')}</div>
            </div>
          </div>
        )}

        {view === 'lijst' ? (
          <ListView
            pipeline={filtered}
            filterStage={filterStage}
            setFilterStage={setFilterStage}
            onEdit={p => { setEditProspect(p); setShowModal(true) }}
            onDelete={async p => { if(confirm('Verwijderen?')) { await db.deleteProspect(p.id); refresh() } }}
            onConvert={handleConvert}
            onStageChange={handleStageChange}
            converting={converting}
            showView={showView}
            onRefreshTasks={() => db.getAllPipelineTasks().then(setOpenTasks)}
          />
        ) : (
          <KanbanView
            pipeline={pipeline}
            onDragStart={setDragging}
            onDrop={handleDrop}
            dragging={dragging}
            onEdit={p => { setEditProspect(p); setShowModal(true) }}
            onConvert={handleConvert}
            converting={converting}
          />
        )}
      </div>

      {showModal && (
        <ProspectModal
          prospect={editProspect}
          organizationId={organizationId}
          onClose={() => setShowModal(false)}
          onSave={() => { refresh(); setShowModal(false) }}
        />
      )}
    </div>
  )
}

// ── List View ──────────────────────────────────────────────────────────────────
function ListView({ pipeline, filterStage, setFilterStage, onEdit, onDelete, onConvert, onStageChange, converting, showView, onRefreshTasks }) {
  return (
    <div>
      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
        <button className={`btn btn-sm ${filterStage==='all'?'btn-primary':'btn-ghost'}`} onClick={() => setFilterStage('all')}>Alles ({pipeline.length})</button>
        {STAGES.map(s => (
          <button key={s.key} className={`btn btn-sm ${filterStage===s.key?'btn-primary':'btn-ghost'}`} onClick={() => setFilterStage(s.key)} style={filterStage===s.key?{background:s.color,borderColor:s.color}:{}}>{s.label}</button>
        ))}
      </div>
      <div className="sc" style={{padding:0}}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1.2fr 1fr 1fr 1fr 140px',padding:'9px 20px',background:'var(--bg2)',borderBottom:'1px solid var(--border)',fontSize:10,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em'}}>
          <div>Prospect</div><div>Bron</div><div>Fase</div><div>Waarde</div><div>Follow-up</div><div></div>
        </div>
        {!pipeline.length ? <div className="empty">Geen prospects gevonden</div> : pipeline.map(p => {
          const ff = p.next_followup ? daysN(p.next_followup) : null
          const ffColor = ff !== null ? (ff < 0 ? 'var(--red-text)' : ff === 0 ? 'var(--amber-text)' : 'var(--text-muted)') : 'var(--text-faint)'
          return (
            <div key={p.id} style={{display:'grid',gridTemplateColumns:'2fr 1.2fr 1fr 1fr 1fr 140px',padding:'13px 20px',borderBottom:'1px solid var(--border)',alignItems:'center',transition:'background .1s'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--accent-soft)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}
            >
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div className={`avatar ${avColor(p)}`} style={{width:32,height:32,fontSize:11,flexShrink:0}}>{ini(p)}</div>
                <div>
                  <div style={{fontWeight:500,fontSize:14}}>{p.fname} {p.lname}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{p.company||p.email||'—'}</div>
                  {p.interest && <div style={{fontSize:11,color:'var(--text-faint)',fontStyle:'italic',marginTop:1}}>{p.interest}</div>}
                  <ProspectTasksPanel prospect={p} onTasksChange={onRefreshTasks} />
                </div>
              </div>
              <div style={{fontSize:12,color:'var(--text-muted)'}}>{p.source||'—'}</div>
              <div>
                <select
                  value={p.stage}
                  onChange={e => onStageChange(p.id, e.target.value)}
                  style={{width:'auto',padding:'3px 8px',fontSize:12,border:'1px solid var(--border)',borderRadius:99,background:'transparent',cursor:'pointer'}}
                  onClick={e => e.stopPropagation()}
                >
                  {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div style={{fontFamily:'DM Mono',fontSize:13,fontWeight:500}}>{p.deal_value ? money(p.deal_value) : '—'}</div>
              <div style={{fontSize:12,color:ffColor,fontWeight:ff!==null&&ff<=0?600:400}}>
                {p.next_followup ? (ff===0?'Vandaag':ff<0?`${Math.abs(ff)}d te laat`:fdate(p.next_followup)) : '—'}
              </div>
              <div style={{display:'flex',gap:5,justifyContent:'flex-end'}}>
                {p.stage === 'akkoord' && (
                  <button className="btn btn-primary btn-xs" onClick={() => onConvert(p)} disabled={converting===p.id} title="Omzetten naar klant">
                    {converting===p.id ? '…' : '→ Klant'}
                  </button>
                )}
                {p.stage === 'klant' && p.converted_client_id && (
                  <button className="btn btn-ghost btn-xs" onClick={() => showView('client-detail', p.converted_client_id)}>Bekijk</button>
                )}
                <button className="btn btn-ghost btn-xs" onClick={() => onEdit(p)}>✎</button>
                <button className="btn btn-ghost btn-xs" style={{color:'var(--red-text)'}} onClick={() => onDelete(p)}>×</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Kanban View ────────────────────────────────────────────────────────────────
function KanbanView({ pipeline, onDragStart, onDrop, dragging, onEdit, onConvert, converting }) {
  const activeStages = STAGES.filter(s => s.key !== 'afgewezen')

  return (
    <div style={{display:'flex',gap:12,overflowX:'auto',paddingBottom:12}}>
      {activeStages.map(stage => {
        const cards = pipeline.filter(p => p.stage === stage.key)
        const stageValue = cards.reduce((s,p) => s+Number(p.deal_value||0), 0)
        return (
          <div
            key={stage.key}
            style={{minWidth:220,flex:'0 0 220px'}}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); onDrop(stage.key, dragging) }}
          >
            <div style={{padding:'10px 12px',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:stage.color}}></div>
                <span style={{fontWeight:600,fontSize:13,fontFamily:'var(--heading-font)'}}>{stage.label}</span>
                <span style={{fontSize:11,color:'var(--text-faint)',background:'var(--bg2)',padding:'1px 7px',borderRadius:99}}>{cards.length}</span>
              </div>
              {stageValue > 0 && <span style={{fontSize:11,color:'var(--text-muted)',fontFamily:'DM Mono'}}>{money(stageValue)}</span>}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8,minHeight:100}}>
              {cards.map(p => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => onDragStart(p.id)}
                  style={{
                    background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',
                    padding:'12px 14px',cursor:'grab',boxShadow:'var(--shadow)',
                    borderLeft:`3px solid ${stage.color}`,transition:'box-shadow .1s'
                  }}
                  onMouseEnter={e=>e.currentTarget.style.boxShadow='var(--shadow-md)'}
                  onMouseLeave={e=>e.currentTarget.style.boxShadow='var(--shadow)'}
                >
                  <div style={{fontWeight:600,fontSize:13,marginBottom:3}}>{p.fname} {p.lname}</div>
                  {p.company && <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>{p.company}</div>}
                  {p.interest && <div style={{fontSize:11,color:'var(--text-faint)',fontStyle:'italic',marginBottom:6}}>{p.interest}</div>}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6}}>
                    <span style={{fontSize:12,fontFamily:'DM Mono',color:'var(--accent-text)',fontWeight:500}}>{p.deal_value?money(p.deal_value):''}</span>
                    <div style={{display:'flex',gap:4}}>
                      {stage.key === 'akkoord' && (
                        <button className="btn btn-primary btn-xs" onClick={() => onConvert(p)} disabled={converting===p.id}>
                          {converting===p.id?'…':'→ Klant'}
                        </button>
                      )}
                      <button className="btn btn-ghost btn-xs" onClick={() => onEdit(p)}>✎</button>
                    </div>
                  </div>
                  {p.next_followup && (
                    <div style={{marginTop:6,fontSize:10,color:daysN(p.next_followup)<=0?'var(--red-text)':'var(--text-faint)'}}>
                      📅 {fdate(p.next_followup)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Prospect Modal ─────────────────────────────────────────────────────────────
function ProspectModal({ prospect, organizationId, onClose, onSave }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    fname: prospect?.fname || '',
    lname: prospect?.lname || '',
    company: prospect?.company || '',
    email: prospect?.email || '',
    phone: prospect?.phone || '',
    website: prospect?.website || '',
    source: prospect?.source || 'Mailmeteor',
    stage: prospect?.stage || 'benaderd',
    interest: prospect?.interest || '',
    deal_value: prospect?.deal_value || '',
    notes: prospect?.notes || '',
    last_contact: prospect?.last_contact || today(),
    next_followup: prospect?.next_followup || '',
  })
  const f = k => e => setForm(p => ({...p, [k]: e.target.value}))

  async function save() {
    if (!form.fname.trim()) return alert('Vul een voornaam in.')
    setSaving(true)
    try {
      const data = { ...form, deal_value: form.deal_value ? parseFloat(form.deal_value) : null, last_contact: form.last_contact || null, next_followup: form.next_followup || null }
      if (prospect) await db.updateProspect(prospect.id, data)
      else await db.createProspect({ ...data, organization_id: organizationId })
      onSave()
    } catch(e) { alert('Fout: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{prospect ? 'Prospect bewerken' : 'Nieuwe prospect'}</h3>
        <div className="form-row">
          <div className="form-group"><label>Voornaam</label><input value={form.fname} onChange={f('fname')} autoFocus /></div>
          <div className="form-group"><label>Achternaam</label><input value={form.lname} onChange={f('lname')} /></div>
        </div>
        <div className="form-group"><label>Bedrijf</label><input value={form.company} onChange={f('company')} /></div>
        <div className="form-row">
          <div className="form-group"><label>E-mail</label><input type="email" value={form.email} onChange={f('email')} /></div>
          <div className="form-group"><label>Telefoon</label><input type="tel" value={form.phone} onChange={f('phone')} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Bron</label>
            <select value={form.source} onChange={f('source')}>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Fase</label>
            <select value={form.stage} onChange={f('stage')}>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Interesse / dienst</label><input value={form.interest} onChange={f('interest')} placeholder="Bijv. WordPress website, SEO…" /></div>
          <div className="form-group"><label>Verwachte waarde (€)</label><input type="number" value={form.deal_value} onChange={f('deal_value')} min="0" step="50" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Laatste contact</label><input type="date" value={form.last_contact} onChange={f('last_contact')} /></div>
          <div className="form-group"><label>Volgende follow-up</label><input type="date" value={form.next_followup} onChange={f('next_followup')} /></div>
        </div>
        <div className="form-group"><label>Notities</label><textarea value={form.notes} onChange={f('notes')} rows={3} placeholder="Wat hebben jullie besproken? Wat is de situatie?" /></div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Prospect Tasks Panel ───────────────────────────────────────────────────────
function ProspectTasksPanel({ prospect, onTasksChange }) {
  const [tasks, setTasks] = useState([])
  const [input, setInput] = useState('')
  const [date, setDate] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open) db.getPipelineTasks(prospect.id).then(setTasks)
  }, [open, prospect.id])

  const refresh = () => db.getPipelineTasks(prospect.id).then(t => { setTasks(t); onTasksChange && onTasksChange() })

  async function addTask() {
    if (!input.trim()) return
    await db.createPipelineTask({ prospect_id: prospect.id, description: input.trim(), due_date: date || null, priority: 'normaal', done: false })
    setInput(''); setDate(''); refresh()
  }

  async function toggle(t) {
    await db.updatePipelineTask(t.id, { done: !t.done }); refresh()
  }

  const openCount = tasks.filter(t => !t.done).length

  return (
    <div style={{marginTop:8}}>
      <button
        className="btn btn-ghost btn-xs"
        onClick={() => setOpen(!open)}
        style={{display:'flex',alignItems:'center',gap:5}}
      >
        {openCount > 0 && <span style={{background:'var(--amber)',color:'#fff',borderRadius:99,padding:'0 5px',fontSize:10,fontWeight:700,lineHeight:'16px'}}>{openCount}</span>}
        {open ? '▲' : '▼'} Taken {openCount > 0 ? `(${openCount} open)` : ''}
      </button>

      {open && (
        <div style={{marginTop:8,background:'var(--bg2)',borderRadius:'var(--rsm)',padding:'10px 12px'}}>
          {/* Snelle taken templates */}
          <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:8}}>
            {['Follow-up mailen','Bellen','Offerte sturen','WhatsApp sturen','Demo plannen'].map(t => (
              <button key={t} className="btn btn-ghost btn-xs" onClick={() => setInput(t)} style={{fontSize:11}}>{t}</button>
            ))}
          </div>
          {/* Bestaande taken */}
          {tasks.map(t => {
            const dd = t.due_date ? Math.ceil((new Date(t.due_date)-new Date(today()))/86400000) : null
            return (
              <div key={t.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
                <div
                  style={{
                    width:16,height:16,border:`1.5px solid ${t.done?'var(--accent)':'var(--border-strong)'}`,
                    borderRadius:4,flexShrink:0,cursor:'pointer',
                    background:t.done?'var(--accent)':'transparent',
                    display:'flex',alignItems:'center',justifyContent:'center'
                  }}
                  onClick={() => toggle(t)}
                >
                  {t.done && <span style={{color:'#fff',fontSize:9}}>✓</span>}
                </div>
                <div style={{flex:1,fontSize:12,textDecoration:t.done?'line-through':'none',color:t.done?'var(--text-faint)':'var(--text)'}}>{t.description}</div>
                {t.due_date && !t.done && (
                  <span style={{fontSize:10,color:dd<0?'var(--red-text)':dd===0?'var(--amber-text)':'var(--text-faint)',fontWeight:dd<=0?600:400,whiteSpace:'nowrap'}}>
                    {dd<0?Math.abs(dd)+'d te laat':dd===0?'Vandaag':fdate(t.due_date)}
                  </span>
                )}
                <button style={{fontSize:13,color:'var(--text-faint)',cursor:'pointer',lineHeight:1}} onClick={async () => { await db.deletePipelineTask(t.id); refresh() }}>×</button>
              </div>
            )
          })}
          {/* Nieuwe taak */}
          <div style={{display:'flex',gap:6,marginTop:8}}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Nieuwe taak…"
              style={{flex:1,fontSize:12,padding:'5px 8px'}}
              onKeyDown={e => e.key==='Enter' && addTask()}
            />
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{width:120,fontSize:12,padding:'5px 8px'}} />
            <button className="btn btn-primary btn-xs" onClick={addTask}>+</button>
          </div>
        </div>
      )}
    </div>
  )
}
