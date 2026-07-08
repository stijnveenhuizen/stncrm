import React from 'react'
import { motion } from 'framer-motion'
import ProductMockup from './ProductMockup.jsx'

const FEATURES = [
  'Pipeline en sales bijhouden',
  'Websites monitoren en onderhoud loggen',
  'Facturen en offertes versturen',
]

// Gedeelde split-screen layout voor login/registratie/wachtwoord-schermen.
// Op mobiel valt het linkerpaneel weg (CSS media query hieronder).
export default function AuthLayout({ title, children }) {
  return (
    <div className="auth-shell">
      <style>{`
        .auth-shell{min-height:100vh;display:flex;background:var(--bg-app)}
        .auth-side{width:46%;background:#09090B;background-image:radial-gradient(circle at 15% 8%, rgba(61,182,142,.16), transparent 45%);color:#fff;display:flex;flex-direction:column;justify-content:center;padding:56px;flex-shrink:0;overflow:hidden}
        .auth-side-logo{width:40px;height:40px;border-radius:11px;background:var(--accent);display:flex;align-items:center;justify-content:center;margin-bottom:24px}
        .auth-side h2{font-size:22px;font-weight:700;line-height:1.3;margin-bottom:10px;font-family:var(--heading-font);max-width:380px}
        .auth-side p{font-size:13px;color:#A1A1AA;margin-bottom:36px}
        .auth-mockup-wrap{margin-bottom:40px}
        .auth-feature{display:flex;align-items:center;gap:10px;font-size:12px;color:#A1A1AA;margin-bottom:10px}
        .auth-feature-check{color:var(--accent);flex-shrink:0}
        .auth-form-panel{flex:1;display:flex;align-items:center;justify-content:center;padding:24px}
        .auth-form-inner{width:100%;max-width:380px}
        @media(max-width:1024px){ .auth-mockup-wrap{display:none} }
        @media(max-width:768px){ .auth-side{display:none} .auth-form-panel{padding:16px} }
      `}</style>
      <div className="auth-side">
        <div className="auth-side-logo"><span style={{ color: '#fff', fontSize: 17, fontWeight: 700, fontFamily: 'var(--heading-font)' }}>S</span></div>
        <h2>Het CRM speciaal voor webdesigners</h2>
        <p>Beheer klanten, projecten en facturen op één plek.</p>
        <div className="auth-mockup-wrap"><ProductMockup /></div>
        {FEATURES.map((f, i) => (
          <motion.div key={f} className="auth-feature" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9 + i * 0.08, duration: 0.3 }}>
            <span className="auth-feature-check">✓</span>{f}
          </motion.div>
        ))}
      </div>
      <div className="auth-form-panel">
        <div className="auth-form-inner">
          <h1 style={{ fontFamily: 'var(--heading-font)', fontSize: 20, fontWeight: 700, marginBottom: 24, letterSpacing: '-.01em' }}>{title}</h1>
          {children}
        </div>
      </div>
    </div>
  )
}

export function AuthField({ label, index, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06, duration: 0.25 }} style={{ marginBottom: 16 }}>
      <label>{label}</label>
      {children}
    </motion.div>
  )
}

export function AuthError({ children }) {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
      style={{ background: 'var(--red-soft)', color: 'var(--red-text)', borderRadius: 'var(--rsm)', padding: '9px 12px', fontSize: 13, marginBottom: 16, border: '1px solid rgba(220,38,38,0.15)', overflow: 'hidden' }}>
      {children}
    </motion.div>
  )
}

export function AuthButton({ children, ...props }) {
  return (
    <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} type="submit" {...props} style={{
      width: '100%', padding: 11, background: 'var(--accent)', color: '#fff', border: 'none',
      borderRadius: 'var(--rsm)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--heading-font)',
      cursor: props.disabled ? 'not-allowed' : 'pointer', opacity: props.disabled ? 0.7 : 1,
      boxShadow: '0 2px 8px rgba(61,182,142,0.3)', ...(props.style || {}),
    }}>
      {children}
    </motion.button>
  )
}

export function GoogleButton({ onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      width: '100%', padding: 10, background: 'var(--bg-base)', color: 'var(--text-primary)',
      border: '1px solid var(--border-default)', borderRadius: 'var(--rsm)', fontWeight: 500, fontSize: 13,
      cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Doorgaan met Google
    </button>
  )
}
