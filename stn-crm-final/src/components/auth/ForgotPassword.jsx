import React, { useState } from 'react'
import { supabase } from '../../lib/supabase'
import AuthLayout, { AuthField, AuthError, AuthButton } from './AuthLayout.jsx'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/wachtwoord-instellen` })
    setLoading(false)
    if (error) return setError(error.message)
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout title="Check je inbox">
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          We hebben een herstellink gestuurd naar <strong>{email}</strong>. Klik op de link om een nieuw wachtwoord in te stellen.
        </p>
        <AuthButton type="button" onClick={() => { window.location.href = '/login' }}>Naar inloggen</AuthButton>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Wachtwoord vergeten">
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Vul je e-mailadres in en we sturen je een herstellink.</p>
      <form onSubmit={submit}>
        <AuthField label="E-mailadres" index={0}>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jij@stnwebdesign.nl" required autoFocus />
        </AuthField>
        {error && <AuthError>{error}</AuthError>}
        <AuthButton disabled={loading}>{loading ? 'Versturen…' : 'Stuur herstellink'}</AuthButton>
      </form>
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12 }}>
        <span onClick={() => { window.location.href = '/login' }} style={{ color: 'var(--accent-text)', fontWeight: 600, cursor: 'pointer' }}>← Terug naar inloggen</span>
      </div>
    </AuthLayout>
  )
}
