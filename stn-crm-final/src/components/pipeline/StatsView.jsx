import React, { useState, useMemo } from 'react'
import { money } from '../Dashboard.jsx'

const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function inPeriod(dateStr, period) {
  if (period === 'all' || !dateStr) return period === 'all'
  const d = new Date(dateStr); const now = new Date()
  if (period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (period === 'quarter') return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3)
  if (period === 'year') return d.getFullYear() === now.getFullYear()
  return true
}

export default function StatsView({ prospects, stages, activities }) {
  const [period, setPeriod] = useState('year')
  const stageById = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s])), [stages])

  const won = prospects.filter(p => p.won_at && inPeriod(p.won_at, period))
  const lost = prospects.filter(p => p.lost_at && inPeriod(p.lost_at, period))
  const closedCount = won.length + lost.length
  const wonRevenue = won.reduce((s, p) => s + Number(p.deal_value || 0), 0)
  const conversionRatio = closedCount ? Math.round((won.length / closedCount) * 100) : 0
  const avgDealSize = won.length ? wonRevenue / won.length : 0

  // Funnel per fase
  const funnel = stages.filter(s => !s.is_lost).map(s => {
    const inStage = prospects.filter(p => p.stage_id === s.id)
    return { stage: s, count: inStage.length, value: inStage.reduce((sum, p) => sum + Number(p.deal_value || 0), 0) }
  })
  const maxCount = Math.max(1, ...funnel.map(f => f.count))

  // Win/verlies per maand (huidig jaar)
  const yearNow = new Date().getFullYear()
  const monthly = MONTHS.map((m, i) => {
    const w = prospects.filter(p => p.won_at && new Date(p.won_at).getFullYear() === yearNow && new Date(p.won_at).getMonth() === i).length
    const l = prospects.filter(p => p.lost_at && new Date(p.lost_at).getFullYear() === yearNow && new Date(p.lost_at).getMonth() === i).length
    return { m, w, l }
  })
  const maxMonthly = Math.max(1, ...monthly.map(x => Math.max(x.w, x.l)))

  // Verloren redenen top 5
  const reasonCounts = {}
  prospects.filter(p => p.lost_reason).forEach(p => { reasonCounts[p.lost_reason] = (reasonCounts[p.lost_reason] || 0) + 1 })
  const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const totalReasons = topReasons.reduce((s, [, c]) => s + c, 0)
  const reasonColors = ['#dc2626', '#d97706', '#7c3aed', '#2563eb', '#6b7280']
  let cum = 0
  const reasonGradient = topReasons.map(([r, c], i) => {
    const pct = totalReasons ? (c / totalReasons) * 100 : 0
    const part = `${reasonColors[i]} ${cum}% ${cum + pct}%`
    cum += pct
    return part
  })

  // Doorlooptijd per fase (gemiddelde dagen tussen opeenvolgende fase-wisselingen)
  const stageDurations = {}
  const byProspect = {}
  activities.filter(a => a.type === 'fase_wisseling').forEach(a => { (byProspect[a.prospect_id] ||= []).push(a) })
  Object.values(byProspect).forEach(list => {
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    for (let i = 0; i < list.length - 1; i++) {
      const stageName = (list[i].title.match(/naar "(.+)"/) || [])[1]
      if (!stageName) continue
      const days = (new Date(list[i + 1].created_at) - new Date(list[i].created_at)) / 86400000
      ;(stageDurations[stageName] ||= []).push(days)
    }
  })
  const durationRows = stages.filter(s => !s.is_won && !s.is_lost).map(s => {
    const arr = stageDurations[s.name] || []
    const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
    return { stage: s, avg }
  })
  const longest = durationRows.reduce((max, r) => (r.avg != null && (max == null || r.avg > max.avg)) ? r : max, null)

  // Prestaties per teamlid
  const byMember = {}
  prospects.forEach(p => {
    const name = p.assignee?.full_name || 'Niet toegewezen'
    const m = byMember[name] ||= { active: 0, won: 0, wonRevenue: 0, closed: 0 }
    const stage = stageById[p.stage_id]
    if (!stage?.is_won && !stage?.is_lost) m.active++
    if (stage?.is_won) { m.won++; m.wonRevenue += Number(p.deal_value || 0); m.closed++ }
    if (stage?.is_lost) m.closed++
  })

  return (
    <div>
      <div className="page-toolbar">
        <select value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 'auto' }}>
          <option value="month">Deze maand</option>
          <option value="quarter">Dit kwartaal</option>
          <option value="year">Dit jaar</option>
          <option value="all">Alle periodes</option>
        </select>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-label">Gewonnen deals</div><div className="stat-value">{won.length}</div></div>
        <div className="stat-card"><div className="stat-label">Gewonnen omzet</div><div className="stat-value" style={{ fontSize: 18 }}>{money(wonRevenue)}</div></div>
        <div className="stat-card"><div className="stat-label">Conversieratio</div><div className="stat-value" style={{ color: 'var(--teal-text)' }}>{conversionRatio}%</div></div>
        <div className="stat-card"><div className="stat-label">Gem. dealgrootte</div><div className="stat-value" style={{ fontSize: 18 }}>{money(avgDealSize)}</div></div>
      </div>

      <div className="sc" style={{ marginBottom: 16 }}>
        <div className="sc-head"><span className="sc-title">Funnel per fase</span></div>
        <div className="sc-body">
          {funnel.map((f, i) => {
            const prev = funnel[i - 1]
            const dropoff = prev && prev.count > 0 ? Math.round((1 - f.count / prev.count) * 100) : 0
            return (
              <div key={f.stage.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{f.stage.name}</span>
                  <span style={{ color: 'var(--text-faint)' }}>{f.count} deals · {money(f.value)}{i > 0 ? ` · -${dropoff}% t.o.v. vorige fase` : ''}</span>
                </div>
                <div style={{ height: 20, background: 'var(--bg2)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: Math.max(4, (f.count / maxCount) * 100) + '%', background: f.stage.color, borderRadius: 6 }}></div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Gewonnen vs. verloren per maand ({yearNow})</span></div>
          <div className="sc-body">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
              {monthly.map(x => (
                <div key={x.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100 }}>
                    <div title={`Gewonnen: ${x.w}`} style={{ width: 8, height: Math.max(2, (x.w / maxMonthly) * 100), background: 'var(--green)', borderRadius: 2 }}></div>
                    <div title={`Verloren: ${x.l}`} style={{ width: 8, height: Math.max(2, (x.l / maxMonthly) * 100), background: 'var(--red)', borderRadius: 2 }}></div>
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text-faint)' }}>{x.m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Verloren redenen</span></div>
          <div className="sc-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {!topReasons.length ? <div className="empty">Nog geen verloren deals</div> : (
              <>
                <div style={{ width: 110, height: 110, borderRadius: '50%', background: `conic-gradient(${reasonGradient.join(',')})` }}></div>
                <div style={{ marginTop: 12, width: '100%' }}>
                  {topReasons.map(([r, c], i) => (
                    <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 3 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: reasonColors[i], flexShrink: 0 }}></span>
                      <span style={{ flex: 1 }}>{r}</span><span style={{ color: 'var(--text-faint)' }}>{c}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Doorlooptijd per fase</span></div>
          <div className="sc-body">
            {durationRows.map(r => (
              <div key={r.stage.id} className="info-row" style={{ background: longest && r.stage.id === longest.stage.id ? 'var(--amber-soft)' : 'transparent', borderRadius: 6, padding: '6px 8px' }}>
                <span className="info-label" style={{ width: 'auto', flex: 1 }}>{r.stage.name}</span>
                <span className="info-val">{r.avg != null ? Math.round(r.avg) + ' dagen' : '—'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Prestaties per teamlid</span></div>
          <div className="sc-body" style={{ padding: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 0.7fr 1fr 0.8fr', padding: '8px 14px', fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
              <div>Teamlid</div><div>Actief</div><div>Gewonnen</div><div>Omzet</div><div>Conv.%</div>
            </div>
            {Object.entries(byMember).map(([name, m]) => (
              <div key={name} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.7fr 0.7fr 1fr 0.8fr', padding: '8px 14px', fontSize: 13, borderTop: '1px solid var(--border)' }}>
                <div>{name}</div><div>{m.active}</div><div>{m.won}</div><div style={{ fontFamily: 'var(--mono-font)' }}>{money(m.wonRevenue)}</div>
                <div>{m.closed ? Math.round((m.won / m.closed) * 100) : 0}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
