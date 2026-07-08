import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import AuthLayout, { AuthField, AuthError, AuthButton, GoogleButton } from './auth/AuthLayout.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const justReset = new URLSearchParams(window.location.search).get('reset') === '1'

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Ongeldig e-mailadres of wachtwoord.')
      setShake(true); setTimeout(() => setShake(false), 400)
    }
    setLoading(false)
  }

  async function handleGoogle() {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) setError('Google-login is nog niet geconfigureerd voor dit project.')
  }

  return (
    <AuthLayout title="Welkom terug">
      {justReset && (
        <div style={{ background: 'var(--green-soft)', color: 'var(--green-text)', borderRadius: 'var(--rsm)', padding: '9px 12px', fontSize: 13, marginBottom: 16 }}>
          Wachtwoord gewijzigd — log opnieuw in.
        </div>
      )}
      <motion.form onSubmit={handleLogin} animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : {}} transition={{ duration: 0.4 }}>
        <AuthField label="E-mailadres" index={0}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jij@stnwebdesign.nl" required autoFocus />
        </AuthField>
        <AuthField label="Wachtwoord" index={1}>
          <div style={{ position: 'relative' }}>
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={{ paddingRight: 66 }} />
            <span onClick={() => setShowPassword(s => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
              {showPassword ? 'verberg' : 'toon'}
            </span>
          </div>
        </AuthField>
        {error && <AuthError>{error}</AuthError>}
        <AuthButton disabled={loading}>{loading ? 'Inloggen…' : 'Inloggen →'}</AuthButton>
      </motion.form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>of</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
      </div>
      <GoogleButton onClick={handleGoogle} />

      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12 }}>
        <span onClick={() => { window.location.href = '/wachtwoord-vergeten' }} style={{ color: 'var(--accent-text)', fontWeight: 600, cursor: 'pointer' }}>Wachtwoord vergeten?</span>
      </div>
      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
        Nog geen account? Je hebt een uitnodigingslink nodig.
      </div>
    </AuthLayout>
  )
}
