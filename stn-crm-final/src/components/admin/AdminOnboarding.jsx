import React, { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import * as db from '../../lib/db'

const STEP_LABELS = { welcome: 'Welkom', company_setup: 'Bedrijf', first_client: 'Eerste klant', first_project: 'Eerste project', demo_tour: 'Rondleiding', completed: 'Klaar' }

export default function AdminOnboarding() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { db.adminGetOnboardingStats().then(setData).catch(e => setError(e.message)) }, [])

  if (error) return <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>
  if (!data) return <div style={{ color: 'var(--text-muted-tok)', fontSize: 13 }}>Laden…</div>

  const maxViewed = data.steps[0]?.viewed || 1
  const worstDropoffIdx = data.steps.reduce((worst, s, i) => (i > 0 && s.dropoffPct > (data.steps[worst]?.dropoffPct || 0)) ? i : worst, -1)
  const completionPct = data.totalStarted ? Math.round((data.totalCompleted / data.totalStarted) * 100) : 0
  const avgTotalSeconds = data.steps.reduce((s, st) => s + (st.avgDurationSeconds || 0), 0)
  const skippedPct = data.totalStarted ? Math.round((data.totalSkipped / data.totalStarted) * 100) : 0

  const days = Object.keys(data.completionsByDay || {}).sort()
  const chartData = days.map(d => ({ date: d.slice(5), completions: data.completionsByDay[d] }))

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Onboarding analytics</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="admin-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Funnel</div>
          {data.steps.map((s, i) => {
            const pct = maxViewed ? Math.round((s.viewed / maxViewed) * 100) : 0
            return (
              <div key={s.step} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span>Stap {i + 1} — {STEP_LABELS[s.step] || s.step}</span>
                  <span>{pct}% ({s.viewed} gebruikers){i === worstDropoffIdx ? <span style={{ color: 'var(--warning)' }}> ⚠️</span> : ''}</span>
                </div>
                <div style={{ height: 20, background: 'var(--bg-subtle)', borderRadius: 6 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 6, transition: 'width .3s' }} />
                </div>
                {i > 0 && s.dropoffPct > 0 && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>-{s.dropoffPct}%</div>}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="admin-kpi"><div className="admin-kpi-label">Voltooiingspercentage</div><div className="admin-kpi-value">{completionPct}%</div></div>
          <div className="admin-kpi"><div className="admin-kpi-label">Gem. tijd totaal</div><div className="admin-kpi-value">{Math.round(avgTotalSeconds / 60)} min</div></div>
          <div className="admin-kpi"><div className="admin-kpi-label">Meeste drop-off</div><div className="admin-kpi-value" style={{ fontSize: 16 }}>{worstDropoffIdx >= 0 ? `Stap ${worstDropoffIdx + 1}` : '—'}</div></div>
          <div className="admin-kpi"><div className="admin-kpi-label">Geskipt</div><div className="admin-kpi-value">{skippedPct}%</div></div>
        </div>
      </div>

      <div className="admin-card" style={{ padding: 20, marginBottom: 16, overflowX: 'auto' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Per stap</div>
        <table className="admin-table">
          <thead><tr><th>Stap</th><th>Bekeken</th><th>Voltooid</th><th>Overgeslagen</th><th>Gem. tijd</th><th>Drop-off</th></tr></thead>
          <tbody>
            {data.steps.map((s, i) => (
              <tr key={s.step}>
                <td>{i + 1}. {STEP_LABELS[s.step] || s.step}</td>
                <td>{s.viewed}</td><td>{s.completed}</td><td>{s.skipped}</td>
                <td>{s.avgDurationSeconds != null ? `${Math.round(s.avgDurationSeconds)}s` : '—'}</td>
                <td style={{ color: s.dropoffPct > 10 ? 'var(--danger)' : 'inherit' }}>{s.dropoffPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Onboarding voltooiingen per dag</div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-default)', fontSize: 12, color: 'var(--text-primary)' }} />
              <Line type="monotone" dataKey="completions" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
