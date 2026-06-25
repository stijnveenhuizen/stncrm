import React, { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
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
  const donutData = stageSlices.map(s => ({ name: s.name, value: byStage[s.id], color: s.color }))

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
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.8fr 0.6fr 1fr 0.9fr 1fr', padding: '8px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-default)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted-tok)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            <div>Prospect</div><div>Fase</div><div>Waarde</div><div>Kans%</div><div>Gewogen</div><div>Sluiting</div><div>Toegewezen</div>
          </div>
          {!rows.length ? <div className="empty">Geen actieve deals in deze periode</div> : rows.map(({ p, stage, prob, value, weighted }) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.8fr 0.6fr 1fr 0.9fr 1fr', padding: '10px 16px', borderBottom: '1px solid var(--border-default)', fontSize: 13, alignItems: 'center' }}>
              <div>{p.fname} {p.lname}{p.company ? <span style={{ color: 'var(--text-muted-tok)', fontSize: 11 }}> · {p.company}</span> : ''}</div>
              <div>{stage && <span className="badge" style={{ background: stage.color + '18', color: stage.color, borderColor: stage.color + '40' }}>{stage.name}</span>}</div>
              <div style={{ fontFamily: 'var(--mono-font)' }}>{money(value)}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{prob}%</div>
              <div style={{ fontFamily: 'var(--mono-font)', fontWeight: 600, color: weighted > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>{money(weighted)}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{p.expected_close_date ? fdate(p.expected_close_date) : '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.assignee?.full_name || '—'}</div>
            </div>
          ))}
          {rows.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.8fr 0.6fr 1fr 0.9fr 1fr', padding: '12px 16px', background: 'var(--bg-subtle)', borderTop: '2px solid var(--border-default)', fontSize: 13, fontWeight: 600 }}>
              <div>Totaal ({rows.length} deals)</div><div></div>
              <div style={{ fontFamily: 'var(--mono-font)' }}>{money(totalValue)}</div><div></div>
              <div style={{ fontFamily: 'var(--mono-font)', color: 'var(--accent)' }}>{money(totalWeighted)}</div><div></div><div></div>
            </div>
          )}
        </div>
        <div className="sc">
          <div className="sc-head"><span className="sc-title" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted-tok)', textTransform: 'none' }}>Gewogen waarde per fase</span></div>
          <div className="sc-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {!donutData.length ? <div className="empty">Geen actieve deals</div> : (
              <div style={{ width: '100%', height: 160, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2}>
                      {donutData.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
                    </Pie>
                    <Tooltip formatter={v => money(v)} contentStyle={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', pointerEvents: 'none' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted-tok)' }}>Forecast</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono-font)' }}>{money(totalWeighted)}</div>
                </div>
              </div>
            )}
            <div style={{ marginTop: 16, width: '100%' }}>
              {stageSlices.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }}></span>
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--mono-font)', color: 'var(--text-secondary)' }}>{money(byStage[s.id])}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
