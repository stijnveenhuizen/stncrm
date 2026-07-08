import React, { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import * as db from '../../lib/db'

const PERIODS = [
  ['today', 'Vandaag'], ['yesterday', 'Gisteren'], ['7d', '7 dagen'], ['30d', '30 dagen'], ['year', 'Dit jaar'],
]
const DAYS = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']

function periodRange(key) {
  const now = new Date()
  if (key === 'today') return { from: new Date(now.setHours(0, 0, 0, 0)), to: new Date() }
  if (key === 'yesterday') { const y = new Date(); y.setDate(y.getDate() - 1); return { from: new Date(y.setHours(0, 0, 0, 0)), to: new Date(y.setHours(23, 59, 59, 999)) } }
  if (key === '7d') return { from: new Date(Date.now() - 7 * 86400000), to: new Date() }
  if (key === '30d') return { from: new Date(Date.now() - 30 * 86400000), to: new Date() }
  if (key === 'year') return { from: new Date(new Date().getFullYear(), 0, 1), to: new Date() }
  return { from: new Date(Date.now() - 30 * 86400000), to: new Date() }
}

export default function AdminStats() {
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const { from, to } = periodRange(period)
    db.adminGetStats({ from: from.toISOString(), to: to.toISOString() }).then(setData).catch(e => setError(e.message))
  }, [period])

  const maxHeat = data ? Math.max(1, ...data.heatmap.flat()) : 1

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Statistieken</h1>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {PERIODS.map(([k, l]) => <button key={k} className="admin-btn" style={period === k ? { background: 'var(--accent-subtle)', color: 'var(--accent)', borderColor: 'var(--accent-border)' } : {}} onClick={() => setPeriod(k)}>{l}</button>)}
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      {!data ? <div style={{ color: 'var(--text-muted-tok)', fontSize: 13 }}>Laden…</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="admin-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Populairste pagina's</div>
              {!data.topPages.length ? <div style={{ color: 'var(--text-muted-tok)', fontSize: 12 }}>Nog geen data.</div> : data.topPages.map(p => (
                <BarRow key={p.name} label={p.name} value={p.count} max={data.topPages[0].count} />
              ))}
            </div>
            <div className="admin-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Populairste acties</div>
              <table className="admin-table"><tbody>
                {data.topActions.map(a => <tr key={a.name}><td>{a.name}</td><td style={{ textAlign: 'right' }}>{a.count}×</td></tr>)}
                {!data.topActions.length && <tr><td style={{ color: 'var(--text-muted-tok)' }}>Nog geen data.</td></tr>}
              </tbody></table>
            </div>
          </div>

          <div className="admin-card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Gemiddelde sessieduur per dag (minuten)</div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.avgSessionByDay}>
                  <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-default)', fontSize: 12, color: 'var(--text-primary)' }} />
                  <Bar dataKey="minutes" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="admin-card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Peak usage (dag × uur)</div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(24, 1fr)`, gap: 2, minWidth: 700 }}>
                <div />
                {Array.from({ length: 24 }, (_, h) => <div key={h} style={{ fontSize: 9, color: 'var(--text-muted-tok)', textAlign: 'center' }}>{h}</div>)}
                {DAYS.map((d, di) => (
                  <React.Fragment key={d}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted-tok)', display: 'flex', alignItems: 'center' }}>{d}</div>
                    {data.heatmap[di].map((v, hi) => (
                      <div key={hi} title={`${v}`} style={{ height: 16, borderRadius: 2, background: v ? `rgba(61,182,142,${Math.min(1, v / maxHeat)})` : 'var(--bg-subtle)' }} />
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
            <div className="admin-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Retentie (cohort per registratiemaand)</div>
              <table className="admin-table">
                <thead><tr><th>Maand</th><th>Users</th><th>Dag 1</th><th>Dag 7</th><th>Dag 30</th></tr></thead>
                <tbody>{data.retention.map(c => <tr key={c.month}><td>{c.month}</td><td>{c.total}</td><td>{c.d1Pct}%</td><td>{c.d7Pct}%</td><td>{c.d30Pct}%</td></tr>)}</tbody>
              </table>
            </div>
            <div className="admin-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Feature-adoptie</div>
              {data.featureAdoption.map(f => <BarRow key={f.label} label={f.label} value={f.pct} max={100} suffix="%" />)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function BarRow({ label, value, max, suffix = '' }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><span>{label}</span><span style={{ color: 'var(--text-muted-tok)' }}>{value}{suffix}</span></div>
      <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 4 }}><div style={{ height: '100%', width: `${max ? (value / max) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 4 }} /></div>
    </div>
  )
}
