import React, { useState, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import * as db from '../../lib/db'
import { money, fdate, daysN, showToast } from '../Dashboard.jsx'
import { SOURCES, SnoozeDropdown } from '../PipelineView.jsx'
import DuplicateProspectModal from './DuplicateProspectModal.jsx'

function ActivityCell({ prospect: p, stage }) {
  const rot = db.rotLevel(p, stage)
  const days = db.daysInStage(p)
  const color = rot === 'heavy' ? 'var(--danger)' : rot === 'light' ? 'var(--warning)' : 'var(--success)'
  const label = days === 0 ? 'Vandaag' : days === 1 ? 'Gisteren' : `${days} dagen geleden`
  return <span style={{ fontSize: 12, color, fontWeight: rot !== 'none' ? 600 : 400 }}>{label}</span>
}

export default function ListTable({ prospects, stages, onOpen, onRefresh, onCreate }) {
  const [filterStageIds, setFilterStageIds] = useState([])
  const [filterSources, setFilterSources] = useState([])
  const [filterStatus, setFilterStatus] = useState('actief')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [selected, setSelected] = useState([])
  const [tagInput, setTagInput] = useState(null) // null = closed, '' = open empty
  const [snoozeOpenId, setSnoozeOpenId] = useState(null)
  const [duplicateProspect, setDuplicateProspect] = useState(null)

  const stageById = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s])), [stages])

  const filtered = useMemo(() => {
    let list = prospects.filter(p => {
      if (filterStageIds.length && !filterStageIds.includes(p.stage_id)) return false
      if (filterSources.length && !filterSources.includes(p.source)) return false
      const stage = stageById[p.stage_id]
      if (filterStatus === 'actief' && (stage?.is_won || stage?.is_lost)) return false
      if (filterStatus === 'gewonnen' && !stage?.is_won) return false
      if (filterStatus === 'verloren' && !stage?.is_lost) return false
      return true
    })
    list.sort((a, b) => {
      let av, bv
      if (sortKey === 'naam') { av = a.fname + a.lname; bv = b.fname + b.lname }
      else if (sortKey === 'fase') { av = stageById[a.stage_id]?.sort_order ?? 0; bv = stageById[b.stage_id]?.sort_order ?? 0 }
      else if (sortKey === 'waarde') { av = Number(a.deal_value || 0); bv = Number(b.deal_value || 0) }
      else { av = a[sortKey] || ''; bv = b[sortKey] || '' }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [prospects, filterStageIds, filterSources, filterStatus, sortKey, sortDir, stageById])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  function toggleSelected(id) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
  function toggleFilterArr(arr, setArr, val) { setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]) }

  async function bulkAssignStage(stageId) {
    if (!stageId) return
    const stage = stageById[stageId]
    try { await Promise.all(selected.map(id => db.updateProspect(id, { stage_id: stageId, win_probability: stage.win_probability }))); setSelected([]); onRefresh(); showToast('Fase gewijzigd voor ' + selected.length + ' prospects') }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function bulkDelete() {
    if (!confirm(`${selected.length} prospects verwijderen?`)) return
    try { await Promise.all(selected.map(id => db.deleteProspect(id))); setSelected([]); onRefresh() }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function bulkAddTag() {
    if (!tagInput || !tagInput.trim()) { setTagInput(null); return }
    try {
      await Promise.all(selected.map(id => {
        const p = prospects.find(x => x.id === id)
        const tags = Array.from(new Set([...(p?.tags || []), tagInput.trim()]))
        return db.updateProspect(id, { tags })
      }))
      setSelected([]); setTagInput(null); onRefresh()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  const SortHeader = ({ k, label }) => (
    <div className="sortable" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }} onClick={() => toggleSort(k)}>
      {label}{sortKey === k && (sortDir === 'asc' ? ' ↑' : ' ↓')}
    </div>
  )

  return (
    <div>
      <div className="page-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto' }}>
          <option value="actief">Actief</option>
          <option value="gewonnen">Gewonnen</option>
          <option value="verloren">Verloren</option>
          <option value="alle">Alle</option>
        </select>
        <select multiple value={filterStageIds} onChange={e => setFilterStageIds(Array.from(e.target.selectedOptions, o => o.value))} style={{ width: 160 }} title="Fase (multi-select met Cmd/Ctrl)">
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select multiple value={filterSources} onChange={e => setFilterSources(Array.from(e.target.selectedOptions, o => o.value))} style={{ width: 160 }} title="Bron (multi-select met Cmd/Ctrl)">
          {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {selected.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', padding: '8px 14px', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{selected.length} geselecteerd</span>
          <select onChange={e => bulkAssignStage(e.target.value)} value="" style={{ width: 'auto', fontSize: 12, height: 28 }}>
            <option value="">Fase wijzigen…</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {tagInput === null ? (
            <button className="btn btn-ghost btn-xs" onClick={() => setTagInput('')}>+ Tag</button>
          ) : (
            <div style={{ display: 'flex', gap: 4 }}>
              <input autoFocus value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && bulkAddTag()} placeholder="Tagnaam…" style={{ height: 28, width: 120, fontSize: 12 }} />
              <button className="btn btn-primary btn-xs" onClick={bulkAddTag}>Toevoegen</button>
            </div>
          )}
          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--danger)' }} onClick={bulkDelete}>Verwijderen</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setSelected([])} style={{ marginLeft: 'auto' }}>Selectie wissen</button>
        </div>
      )}

      <div className="sc" style={{ padding: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1.4fr 0.9fr 0.7fr 0.6fr 0.9fr 0.8fr 0.9fr 1fr 80px', padding: '8px 12px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-default)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted-tok)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <div></div>
          <SortHeader k="naam" label="Prospect" />
          <SortHeader k="fase" label="Fase" />
          <SortHeader k="waarde" label="Waarde" />
          <div>Kans%</div>
          <SortHeader k="expected_close_date" label="Sluiting" />
          <div>Bron</div>
          <div>Toegewezen</div>
          <div>Activiteit</div>
          <div>Acties</div>
        </div>
        {!filtered.length ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 18, color: 'var(--text-muted-tok)' }}>▲</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>Geen prospects gevonden</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted-tok)', marginBottom: 16 }}>Voeg een prospect toe om je pipeline bij te houden</div>
            {onCreate && <button className="btn btn-primary btn-sm" onClick={onCreate}>+ Prospect toevoegen</button>}
          </div>
        ) : filtered.map(p => {
          const stage = stageById[p.stage_id]
          const overdue = p.expected_close_date && daysN(p.expected_close_date) < 0
          const prob = p.win_probability ?? stage?.win_probability ?? 0
          return (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '28px 1.4fr 0.9fr 0.7fr 0.6fr 0.9fr 0.8fr 0.9fr 1fr 80px', padding: '10px 12px', borderBottom: '1px solid var(--border-default)', alignItems: 'center', fontSize: 13, cursor: 'pointer', transition: 'background 80ms ease', opacity: p.snoozed_until ? 0.6 : 1 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={() => onOpen(p)}>
              <input type="checkbox" checked={selected.includes(p.id)} onChange={e => { e.stopPropagation(); toggleSelected(p.id) }} onClick={e => e.stopPropagation()} style={{ width: 15, height: 15 }} />
              <div><div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{p.fname} {p.lname}{p.snoozed_until ? ' 🌙' : ''}</div><div style={{ fontSize: 11, color: 'var(--text-muted-tok)' }}>{p.company || ''}</div></div>
              <div>{stage && <span className="badge" style={{ background: stage.color + '18', color: stage.color, borderColor: stage.color + '40' }}>{stage.name}</span>}</div>
              <div style={{ fontFamily: 'var(--mono-font)', color: 'var(--text-primary)' }}>{p.deal_value ? money(p.deal_value) : '—'}</div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 3 }}>{prob}%</div>
                <div style={{ height: 4, background: 'var(--bg-subtle)', borderRadius: 99, width: 40 }}><div style={{ height: '100%', width: prob + '%', background: 'var(--accent)', borderRadius: 99 }}></div></div>
              </div>
              <div style={{ color: overdue ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: overdue ? 600 : 400 }}>{p.expected_close_date ? fdate(p.expected_close_date) : '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.source || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {p.assignee?.full_name && <span className="avatar av-g" style={{ width: 18, height: 18, fontSize: 8 }}>{p.assignee.full_name.slice(0, 2).toUpperCase()}</span>}
                {p.assignee?.full_name || '—'}
              </div>
              <div><ActivityCell prospect={p} stage={stage} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} onClick={e => e.stopPropagation()}>
                <span onClick={() => setSnoozeOpenId(o => o === p.id ? null : p.id)} style={{ cursor: 'pointer', fontSize: 13 }} title="Snooze">🌙</span>
                <span onClick={() => setDuplicateProspect(p)} style={{ cursor: 'pointer', fontSize: 13 }} title="Dupliceer">⎘</span>
                <AnimatePresence>
                  {snoozeOpenId === p.id && <SnoozeDropdown prospect={p} onClose={() => setSnoozeOpenId(null)} onRefresh={onRefresh} />}
                </AnimatePresence>
              </div>
            </div>
          )
        })}
      </div>
      <AnimatePresence>
        {duplicateProspect && (
          <DuplicateProspectModal prospect={duplicateProspect} stages={stages} onClose={() => setDuplicateProspect(null)}
            onDone={async newProspect => { setDuplicateProspect(null); await onRefresh(); onOpen(newProspect) }} />
        )}
      </AnimatePresence>
    </div>
  )
}
