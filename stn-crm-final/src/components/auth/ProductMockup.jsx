import React from 'react'
import { motion } from 'framer-motion'

// Nagebouwde "screenshot" van de Pipeline-kanban — gebruikt de echte standaard-
// fasenamen/-kleuren uit PIPELINE_PRO_SETUP.sql, zodat het linkerpaneel van de
// auth-schermen een herkenbaar productbeeld toont i.p.v. een generieke iconen-
// lijst. Puur CSS/SVG, geen externe afbeeldingen nodig.
const COLUMNS = [
  { name: 'Benaderd', color: '#6b7280', cards: [
    { initials: 'MJ', bg: '#dbeafe', fg: '#1d4ed8', name: 'Bakkerij Jansen', value: '€ 1.800' },
    { initials: 'RV', bg: '#fef3c7', fg: '#b45309', name: 'Van Es Interieur', value: '€ 950' },
  ] },
  { name: 'Interesse', color: '#2563eb', cards: [
    { initials: 'SK', bg: '#d1fae5', fg: '#065f46', name: 'Studio Kade', value: '€ 3.200' },
  ] },
  { name: 'Gesprek', color: '#7c3aed', cards: [
    { initials: 'HR', bg: '#ede9fe', fg: '#6d28d9', name: 'Hanze HR', value: '€ 4.500' },
    { initials: 'TW', bg: '#ccfbf1', fg: '#0f766e', name: 'De Tuinwinkel', value: '€ 2.100' },
  ] },
  { name: 'Klant gewonnen', color: '#16a34a', cards: [
    { initials: 'AB', bg: '#fee2f2', fg: '#9d174d', name: 'Atelier Boone', value: '€ 6.750' },
  ] },
]

export default function ProductMockup() {
  return (
    <div style={{ position: 'relative' }}>
      <motion.div
        initial={{ opacity: 0, y: 24, rotate: -3, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, rotate: -2, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: '#fff', borderRadius: 14, boxShadow: '0 30px 60px -20px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06)',
          overflow: 'hidden', transformOrigin: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderBottom: '1px solid #E4E4E7', background: '#FAFAFA' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#f87171' }} />
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#fbbf24' }} />
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#4ade80' }} />
          <span style={{ marginLeft: 8, fontSize: 10, color: '#A1A1AA', fontFamily: 'monospace' }}>app.stncrm.nl/pipeline</span>
        </div>
        <div style={{ padding: '14px 14px 16px', minWidth: 460 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#09090B', marginBottom: 12, fontFamily: 'var(--heading-font)' }}>Pipeline</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {COLUMNS.map((col, ci) => (
              <div key={col.name}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 600, color: col.color, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: col.color }} />
                  {col.name}
                  <span style={{ color: '#A1A1AA', fontWeight: 500 }}>{col.cards.length}</span>
                </div>
                {col.cards.map((card, i) => (
                  <motion.div key={card.name}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + ci * 0.08 + i * 0.05, duration: 0.3 }}
                    style={{ background: '#fff', border: '1px solid #E4E4E7', borderLeft: `3px solid ${col.color}`, borderRadius: 7, padding: '7px 8px', marginBottom: 7, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 2px rgba(0,0,0,.03)' }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: card.bg, color: card.fg, fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--heading-font)' }}>{card.initials}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 600, color: '#18181B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
                      <div style={{ fontSize: 9, color: '#71717A', fontFamily: 'monospace' }}>{card.value}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.9, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute', bottom: -22, right: -18, background: '#fff', borderRadius: 10,
          boxShadow: '0 16px 32px -8px rgba(0,0,0,.5)', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-subtle, #e8f8f2)', color: 'var(--accent, #3db68e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>✓</span>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#09090B' }}>Factuur verstuurd</div>
          <div style={{ fontSize: 9, color: '#71717A' }}>Atelier Boone · € 6.750</div>
        </div>
      </motion.div>
    </div>
  )
}
