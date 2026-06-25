import React, { useState, useMemo } from 'react'
import * as db from '../../lib/db'
import { money, fdate, daysN, showToast } from '../Dashboard.jsx'
import { SOURCES } from '../PipelineView.jsx'

export default function ListTable({ prospects, stages, onOpen, onRefresh }) {
  const [filterStageIds, setFilterStageIds] = useState([])
  const [filterSources, setFilterSources] = useState([])
  const [filterStatus, setFilterStatus] = useState('actief')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [selected, setSelected] = useState([])

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
    const tag = window.prompt('Tag toevoegen:')
    if (!tag || !tag.trim()) return
    try {
      await Promise.all(selected.map(id => {
        const p = prospects.find(x => x.id === id)
        const tags = Array.from(new Set([...(p?.tags || []), tag.trim()]))
        return db.updateProspect(id, { tags })
      }))
      setSelected([]); onRefresh()
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 'var(--rsm)', padding: '8px 14px', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{selected.length} geselecteerd</span>
          <select onChange={e => bulkAssignStage(e.target.value)} value="" style={{ width: 'auto', fontSize: 12 }}>
            <option value="">Fase wijzigen…</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-ghost btn-xs" onClick={bulkAddTag}>+ Tag</button>
          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red-text)' }} onClick={bulkDelete}>Verwijderen</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setSelected([])} style={{ marginLeft: 'auto' }}>Selectie wissen</button>
        </div>
      )}

      <div className="sc" style={{ padding: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1.6fr 1fr 0.8fr 0.7fr 1fr 0.9fr 1fr 90px', padding: '9px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          <div></div>
          <SortHeader k="naam" label="Prospect" />
          <SortHeader k="fase" label="Fase" />
          <SortHeader k="waarde" label="Waarde" />
          <div>Kans%</div>
          <SortHeader k="expected_close_date" label="Sluiting" />
          <div>Bron</div>
          <div>Toegewezen</div>
          <div></div>
        </div>
        {!filtered.length ? <div className="empty">Geen prospects gevonden</div> : filtered.map(p => {
          const stage = stageById[p.stage_id]
          const overdue = p.expected_close_date && daysN(p.expected_close_date) < 0
          return (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '28px 1.6fr 1fr 0.8fr 0.7fr 1fr 0.9fr 1fr 90px', padding: '11px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center', fontSize: 13, cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-soft)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={() => onOpen(p)}>
              <input type="checkbox" checked={selected.includes(p.id)} onChange={e => { e.stopPropagation(); toggleSelected(p.id) }} onClick={e => e.stopPropagation()} style={{ width: 15, height: 15 }} />
              <div><div style={{ fontWeight: 500 }}>{p.fname} {p.lname}</div><div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.company || ''}</div></div>
              <div>{stage && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: stage.color + '18', color: stage.color, fontWeight: 600 }}>{stage.name}</span>}</div>
              <div style={{ fontFamily: 'var(--mono-font)' }}>{p.deal_value ? money(p.deal_value) : '—'}</div>
              <div style={{ color: 'var(--text-muted)' }}>{p.win_probability ?? stage?.win_probability ?? 0}%</div>
              <div style={{ color: overdue ? 'var(--red-text)' : 'var(--text-muted)', fontWeight: overdue ? 600 : 400 }}>{p.expected_close_date ? fdate(p.expected_close_date) : '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.source || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.assignee?.full_name || '—'}</div>
              <div></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
