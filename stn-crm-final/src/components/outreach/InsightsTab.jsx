import React, { useState, useEffect, useCallback } from 'react'
import * as db from '../../lib/db'
import { fdate, EmptyState } from '../Dashboard.jsx'

const PERIODS = [['30', 'Laatste 30 dagen'], ['90', 'Laatste 90 dagen'], ['all', 'All-time']]

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0 }

// Percentages: Geopend t.o.v. Verstuurd; Geklikt EN Gereageerd allebei t.o.v.
// Geopend (niet t.o.v. Geklikt) — een reply vereist geen klik, dus dat zijn
// twee onafhankelijke uitkomsten ná het openen, geen strikte keten.
function FunnelLine({ t }) {
  return (
    <div style={{ fontSize: 14, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline' }}>
      <span><strong>{t.sent}</strong> verstuurd</span>
      <span style={{ color: 'var(--text-faint)' }}>·</span>
      <span>
        <strong>{t.opened}</strong> geopend {t.sent > 0 && <span style={{ color: 'var(--text-muted)' }}>({pct(t.opened, t.sent)}%)</span>}
        <span title="Apple Mail Privacy Protection en Gmail's afbeeldingsproxy kunnen een opening tonen ook als de ontvanger de mail niet echt bekeek." style={{ marginLeft: 4, cursor: 'help', color: 'var(--text-faint)' }}>ⓘ</span>
      </span>
      <span style={{ color: 'var(--text-faint)' }}>·</span>
      <span><strong>{t.clicked}</strong> geklikt {t.opened > 0 && <span style={{ color: 'var(--text-muted)' }}>({pct(t.clicked, t.opened)}%)</span>}</span>
      <span style={{ color: 'var(--text-faint)' }}>·</span>
      <span><strong>{t.replied}</strong> gereageerd {t.opened > 0 && <span style={{ color: 'var(--text-muted)' }}>({pct(t.replied, t.opened)}%)</span>}</span>
    </div>
  )
}

function BreakdownTable({ title, rows, nameKey }) {
  if (!rows.length) return null
  return (
    <div className="sc" style={{ marginTop: 16, overflow: 'hidden' }}>
      <div className="sc-head"><span className="sc-title">{title}</span></div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
            {[nameKey === 'name' ? 'Flow' : 'Sector', 'Verstuurd', 'Geopend', 'Geklikt', 'Gereageerd'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r[nameKey]} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 14px', fontWeight: 500 }}>{r[nameKey]}</td>
              <td style={{ padding: '12px 14px' }}>{r.sent}</td>
              <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{r.opened} ({pct(r.opened, r.sent)}%)</td>
              <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{r.clicked} ({pct(r.clicked, r.opened)}%)</td>
              <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{r.replied} ({pct(r.replied, r.opened)}%)</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function InsightsTab({ organizationId }) {
  const [period, setPeriod] = useState('30')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    if (!organizationId) return
    setLoading(true)
    db.outreachGetInsights(organizationId, period).then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [organizationId, period])
  useEffect(() => { refresh() }, [refresh])

  if (loading && !data) return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Laden…</div>

  const list = data?.list || []

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {PERIODS.map(([k, label]) => (
          <button key={k} className={`tab${period === k ? ' active' : ''}`} onClick={() => setPeriod(k)}>{label}</button>
        ))}
      </div>

      {data && (
        <div className="sc"><div className="sc-body"><FunnelLine t={data.totals} /></div></div>
      )}

      {data && <BreakdownTable title="Per flow" rows={data.byFlow} nameKey="name" />}
      {data && <BreakdownTable title="Per sector" rows={data.bySector} nameKey="sector" />}

      <div className="sc" style={{ marginTop: 16, overflow: 'hidden' }}>
        <div className="sc-head"><span className="sc-title">Individuele verzendingen</span></div>
        {!list.length ? (
          <EmptyState icon="📤" title="Nog niets verzonden" sub="Zodra een flow-stap of sjabloon-mail wordt verstuurd, verschijnt de status hier." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                {['Prospect', 'Onderwerp', 'Verzonden op', 'Flow/stap', 'Geopend', 'Geklikt', 'Gereageerd'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(s => (
                <tr key={`${s.source}-${s.id}`} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 500 }}>{s.prospect_name}</td>
                  <td style={{ padding: '12px 14px' }}>{s.subject}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{s.sent_at ? fdate(s.sent_at.slice(0, 10)) : '—'}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{s.flow_name ? `${s.flow_name} · stap ${s.step_order}` : 'Sjabloon'}</td>
                  <td style={{ padding: '12px 14px', color: s.opened_at ? 'var(--green-text)' : 'var(--text-faint)' }}>{s.source === 'flow' ? (s.opened_at ? 'Ja' : 'Nee') : '—'}</td>
                  <td style={{ padding: '12px 14px', color: s.clicked_at ? 'var(--green-text)' : 'var(--text-faint)' }}>{s.source === 'flow' ? (s.clicked_at ? 'Ja' : 'Nee') : '—'}</td>
                  <td style={{ padding: '12px 14px', color: s.replied_at ? 'var(--green-text)' : 'var(--text-faint)' }}>{s.replied_at ? 'Ja' : 'Nee'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
