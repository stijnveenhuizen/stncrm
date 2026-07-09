import React from 'react'
import { fdate, EmptyState } from '../Dashboard.jsx'

const STATUS_STYLE = {
  scheduled: { label: 'concept', bg: 'var(--bg2)', color: 'var(--text-muted)' },
  sent: { label: 'verzonden', bg: 'var(--blue-soft)', color: 'var(--blue-text)' },
  followed_up: { label: 'follow-up verzonden', bg: 'var(--blue-soft)', color: 'var(--blue-text)' },
  replied: { label: 'gereageerd', bg: 'var(--green-soft)', color: 'var(--green-text)' },
  cancelled: { label: 'geannuleerd', bg: 'var(--bg2)', color: 'var(--text-muted)' },
}

export default function SendsTab({ sends }) {
  if (!sends.length) {
    return <EmptyState icon="📤" title="Nog niets verzonden" sub="Zodra je een goedgekeurde e-mail verstuurt, verschijnt de status hier." />
  }

  return (
    <div className="sc" style={{ overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
            {['Prospect', 'E-mailadres', 'Onderwerp', 'Verzonden op', 'Follow-up gepland', 'Status'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sends.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 14px', fontWeight: 500 }}>{s.outreach_prospects?.name || '—'}</td>
              <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{s.outreach_emails?.email || '—'}</td>
              <td style={{ padding: '12px 14px' }}>{s.subject}</td>
              <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{s.sent_at ? fdate(s.sent_at.slice(0, 10)) : '—'}</td>
              <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{s.follow_up_scheduled_at ? fdate(s.follow_up_scheduled_at.slice(0, 10)) : '—'}</td>
              <td style={{ padding: '12px 14px' }}>
                <span className="badge" style={{ background: STATUS_STYLE[s.status]?.bg, color: STATUS_STYLE[s.status]?.color }}>{STATUS_STYLE[s.status]?.label || s.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
