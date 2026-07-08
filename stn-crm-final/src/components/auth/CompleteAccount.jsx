import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import * as db from '../../lib/db'
import AuthLayout, { AuthField, AuthError, AuthButton } from './AuthLayout.jsx'

// Landt hier nadat iemand op de uitnodigingslink uit hun e-mail klikt (Supabase
// zet dan al een echte sessie op basis van de #access_token in de URL — die
// wordt automatisch door supabase-js opgepakt, er komt geen ?token=... query
// param aan te pas zoals bij een zelfgebouwd token-systeem). Deze pagina is dus
// puur het "maak je wachtwoord/naam aan"-scherm, geen validatielogica nodig
// voor de link zelf.
export default function CompleteAccount() {
  const [session, setSession] = useState(undefined) // undefined = nog aan het laden
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  function invalid(msg) {
    setError(msg)
    setShake(true); setTimeout(() => setShake(false), 400)
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (fullName.trim().length < 2) return invalid('Vul je volledige naam in (minimaal 2 tekens).')
    if (password.length < 8 || !/\d/.test(password)) return invalid('Wachtwoord moet minimaal 8 tekens hebben, met minstens 1 cijfer.')
    if (password !== confirm) return invalid('Wachtwoorden komen niet overeen.')

    setLoading(true)
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password, data: { full_name: fullName.trim() } })
      if (updErr) throw updErr
      await db.upsertProfile(session.user.id, { full_name: fullName.trim() })
      await db.createOrganization('Mijn bedrijf')
      window.location.href = '/'
    } catch (e) {
      invalid(e.message || 'Aanmaken account mislukt.')
    } finally {
      setLoading(false)
    }
  }

  if (session === undefined) {
    return <AuthLayout title="Even geduld…"><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Uitnodiging controleren…</div></AuthLayout>
  }

  if (!session) {
    return (
      <AuthLayout title="Link niet meer geldig">
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Deze uitnodigingslink is niet meer geldig of al gebruikt. Neem contact op voor een nieuwe link.
        </p>
        <AuthButton type="button" onClick={() => { window.location.href = '/login' }}>Naar inloggen</AuthButton>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Maak je account aan">
      <motion.form onSubmit={submit} animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : {}} transition={{ duration: 0.4 }}>
        <AuthField label="Volledige naam" index={0}>
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jouw naam" required autoFocus />
        </AuthField>
        <AuthField label="E-mailadres" index={1}>
          <input type="email" value={session.user.email} disabled style={{ color: 'var(--text-muted)', background: 'var(--bg-subtle)' }} />
        </AuthField>
        <AuthField label="Wachtwoord" index={2}>
          <div style={{ position: 'relative' }}>
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimaal 8 tekens" required style={{ paddingRight: 66 }} />
            <span onClick={() => setShowPassword(s => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
              {showPassword ? 'verberg' : 'toon'}
            </span>
          </div>
        </AuthField>
        <AuthField label="Wachtwoord bevestigen" index={3}>
          <input type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required />
        </AuthField>
        {error && <AuthError>{error}</AuthError>}
        <AuthButton disabled={loading}>{loading ? 'Bezig…' : 'Account aanmaken →'}</AuthButton>
      </motion.form>
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--text-faint)' }}>
        Door je aan te melden ga je akkoord met onze Gebruiksvoorwaarden en Privacybeleid.
      </div>
    </AuthLayout>
  )
}
