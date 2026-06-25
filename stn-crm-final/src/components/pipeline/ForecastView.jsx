import React, { useState, useMemo } from 'react'
import { money, fdate } from '../Dashboard.jsx'

export default function ForecastView({ prospects, stages }) {
  const [period, setPeriod] = useState('all')
  const stageById = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s])), [stages])

  const active = useMemo(() => prospects.filter(p => {
    const stage = stageById[p.stage_id]
    if (stage?.is_won || stage?.is_lost) return false
    if (period === 'all' || !p.expected_close_date) return period === 'all'
    const d = new Date(p.expected_close_date); const now = new Date()
    if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    if (period === 'quarter') return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3)
    if (period === 'year') return d.getFullYear() === now.getFullYear()
    return true
  }), [prospects, stageById, period])

  const rows = active.map(p => {
    const stage = stageById[p.stage_id]
    const prob = p.win_probability ?? stage?.win_probability ?? 0
    const value = Number(p.deal_value || 0)
    return { p, stage, prob, value, weighted: value * prob / 100 }
  }).sort((a, b) => b.weighted - a.weighted)

  const totalValue = rows.reduce((s, r) => s + r.value, 0)
  const totalWeighted = rows.reduce((s, r) => s + r.weighted, 0)

  const byStage = {}
  rows.forEach(r => { byStage[r.stage?.id] = (byStage[r.stage?.id] || 0) + r.weighted })
  const stageSlices = stages.filter(s => !s.is_won && !s.is_lost && byStage[s.id] > 0)
  let cumPct = 0
  const gradientParts = stageSlices.map(s => {
    const pct = totalWeighted > 0 ? (byStage[s.id] / totalWeighted) * 100 : 0
    const part = `${s.color} ${cumPct}% ${cumPct + pct}%`
    cumPct += pct
    return part
  })

  return (
    <div>
      <div className="page-toolbar">
        <select value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">Alle periodes</option>
          <option value="month">Deze maand</option>
          <option value="quarter">Dit kwartaal</option>
          <option value="year">Dit jaar</option>
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className="sc" style={{ padding: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.8fr 0.7fr 1fr 1fr', padding: '9px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            <div>Prospect</div><div>Fase</div><div>Waarde</div><div>Kans%</div><div>Gewogen</div><div>Sluiting</div>
          </div>
          {!rows.length ? <div className="empty">Geen actieve deals in deze periode</div> : rows.map(({ p, stage, prob, value, weighted }) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.8fr 0.7fr 1fr 1fr', padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center' }}>
              <div>{p.fname} {p.lname}{p.company ? <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> · {p.company}</span> : ''}</div>
              <div>{stage && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: stage.color + '18', color: stage.color, fontWeight: 600 }}>{stage.name}</span>}</div>
              <div style={{ fontFamily: 'var(--mono-font)' }}>{money(value)}</div>
              <div style={{ color: 'var(--text-muted)' }}>{prob}%</div>
              <div style={{ fontFamily: 'var(--mono-font)', fontWeight: 600, color: 'var(--accent-text)' }}>{money(weighted)}</div>
              <div style={{ color: 'var(--text-muted)' }}>{p.expected_close_date ? fdate(p.expected_close_date) : '—'}</div>
            </div>
          ))}
          {rows.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.8fr 0.7fr 1fr 1fr', padding: '12px 16px', background: 'var(--bg2)', fontSize: 13, fontWeight: 700 }}>
              <div>Totaal ({rows.length} deals)</div><div></div>
              <div style={{ fontFamily: 'var(--mono-font)' }}>{money(totalValue)}</div><div></div>
              <div style={{ fontFamily: 'var(--mono-font)', color: 'var(--accent-text)' }}>{money(totalWeighted)}</div><div></div>
            </div>
          )}
        </div>
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Gewogen waarde per fase</span></div>
          <div className="sc-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 140, height: 140, borderRadius: '50%', background: gradientParts.length ? `conic-gradient(${gradientParts.join(',')})` : 'var(--bg2)', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 18, borderRadius: '50%', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Forecast</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono-font)' }}>{money(totalWeighted)}</div>
              </div>
            </div>
            <div style={{ marginTop: 16, width: '100%' }}>
              {stageSlices.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }}></span>
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--mono-font)', color: 'var(--text-muted)' }}>{money(byStage[s.id])}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
