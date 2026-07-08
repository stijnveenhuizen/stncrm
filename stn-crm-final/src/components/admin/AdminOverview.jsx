import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import * as db from '../../lib/db'
import { money } from '../Dashboard.jsx'
import { CountUp } from './AdminApp.jsx'

const STEP_LABELS = { welcome: 'Welkom', company_setup: 'Bedrijf', first_client: 'Eerste klant', first_project: 'Eerste project', demo_tour: 'Rondleiding', completed: 'Klaar' }

export default function AdminOverview({ onNavigate }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { db.adminGetOverview().then(setData).catch(e => setError(e.message)) }, [])

  if (error) return <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>
  if (!data) return <div style={{ color: 'var(--text-muted-tok)', fontSize: 13 }}>Laden…</div>

  const kpis = [
    { label: 'Totaal gebruikers', value: data.totalUsers },
    { label: 'Actieve werkruimtes', value: data.activeWorkspaces },
    { label: 'MRR (alle klanten)', value: null, display: money(data.mrr) },
    { label: 'Nieuwe users (30d)', value: data.newUsers30d, change: data.newUsersChangePct },
  ]

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Overzicht</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {kpis.map((k, i) => (
          <motion.div key={k.label} className="admin-kpi" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.3 }}>
            <div className="admin-kpi-label">{k.label}</div>
            <div className="admin-kpi-value">{k.display || <CountUp value={k.value} />}</div>
            {k.change != null && <div style={{ fontSize: 12, marginTop: 4, color: k.change >= 0 ? 'var(--success)' : 'var(--danger)' }}>{k.change >= 0 ? '↑' : '↓'} {Math.abs(k.change)}%</div>}
          </motion.div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="admin-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Gebruikersgroei (12 maanden)</div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.userGrowth}>
                <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-default)', fontSize: 12, color: 'var(--text-primary)' }} />
                <Line type="monotone" dataKey="users" stroke="var(--accent)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="admin-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Dagelijks actieve gebruikers (30 dagen)</div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dau}>
                <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-default)', fontSize: 12, color: 'var(--text-primary)' }} />
                <Bar dataKey="users" fill="var(--accent)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="admin-card" style={{ padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Feature gebruik — meest bezochte pagina's</div>
          {!data.featureUsage.length ? <div style={{ fontSize: 12, color: 'var(--text-muted-tok)' }}>Nog geen data.</div> : (
            <div>
              {data.featureUsage.map(f => {
                const max = data.featureUsage[0].count || 1
                return (
                  <div key={f.name} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}><span>{f.name}</span><span style={{ color: 'var(--text-muted-tok)' }}>{f.count}</span></div>
                    <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 4 }}><div style={{ height: '100%', width: `${(f.count / max) * 100}%`, background: 'var(--accent)', borderRadius: 4 }} /></div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="admin-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Onboarding funnel</span>
            <button className="admin-btn" onClick={() => onNavigate('onboarding')}>Volledig rapport →</button>
          </div>
          {data.onboardingMini.map((s, i) => {
            const max = data.onboardingMini[0]?.viewed || 1
            const pct = Math.round((s.viewed / max) * 100)
            return (
              <div key={s.step} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span>{i + 1}. {STEP_LABELS[s.step] || s.step}</span>
                  <span style={{ color: s.dropoffPct > 10 ? 'var(--warning)' : 'var(--text-muted-tok)' }}>{pct}%{s.dropoffPct > 10 ? ' ⚠️' : ''}</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 4 }}><div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 4 }} /></div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
