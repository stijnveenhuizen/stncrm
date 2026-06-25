import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { money } from '../Dashboard.jsx'

const chartTooltipStyle = { background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', fontSize: 12 }

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
    const Gewonnen = prospects.filter(p => p.won_at && new Date(p.won_at).getFullYear() === yearNow && new Date(p.won_at).getMonth() === i).length
    const Verloren = prospects.filter(p => p.lost_at && new Date(p.lost_at).getFullYear() === yearNow && new Date(p.lost_at).getMonth() === i).length
    return { m, Gewonnen, Verloren }
  })

  // Verloren redenen top 5
  const reasonCounts = {}
  prospects.filter(p => p.lost_reason).forEach(p => { reasonCounts[p.lost_reason] = (reasonCounts[p.lost_reason] || 0) + 1 })
  const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const totalReasons = topReasons.reduce((s, [, c]) => s + c, 0)
  const reasonColors = ['#dc2626', '#d97706', '#7c3aed', '#2563eb', '#6b7280']
  const reasonData = topReasons.map(([r, c], i) => ({ name: r, value: c, color: reasonColors[i] }))

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
        {[
          ['Gewonnen deals', won.length, undefined],
          ['Gewonnen omzet', money(wonRevenue), 18],
          ['Conversieratio', conversionRatio + '%', undefined, 'var(--teal-text)'],
          ['Gem. dealgrootte', money(avgDealSize), 18],
        ].map(([label, value, fontSize, color], i) => (
          <motion.div key={label} className="stat-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.3 }}>
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ fontSize, color }}>{value}</div>
          </motion.div>
        ))}
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
                  <span style={{ color: 'var(--text-muted-tok)' }}>{f.count} deals · {money(f.value)}{i > 0 ? ` · -${dropoff}% t.o.v. vorige fase` : ''}</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: Math.max(4, (f.count / maxCount) * 100) + '%' }} transition={{ delay: i * 0.1 + 0.3, duration: 0.6, ease: 'easeOut' }}
                    style={{ height: '100%', background: f.stage.color, borderRadius: 'var(--radius-full)' }}></motion.div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Gewonnen vs. verloren per maand ({yearNow})</span></div>
          <div className="sc-body" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: 'var(--text-muted-tok)' }} axisLine={{ stroke: 'var(--border-default)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Gewonnen" fill="var(--success)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Verloren" fill="var(--danger)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Verloren redenen</span></div>
          <div className="sc-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {!topReasons.length ? <div className="empty">Nog geen verloren deals geregistreerd</div> : (
              <>
                <div style={{ width: '100%', height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={reasonData} dataKey="value" nameKey="name" innerRadius={0} outerRadius={60}>
                        {reasonData.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ marginTop: 8, width: '100%' }}>
                  {topReasons.map(([r, c], i) => (
                    <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 3 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: reasonColors[i], flexShrink: 0 }}></span>
                      <span style={{ flex: 1 }}>{r}</span><span style={{ color: 'var(--text-muted-tok)' }}>{c} ({totalReasons ? Math.round(c / totalReasons * 100) : 0}%)</span>
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
