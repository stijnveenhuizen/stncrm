import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import AuthLayout, { AuthField, AuthError, AuthButton } from './AuthLayout.jsx'

export default function ResetPassword() {
  const [session, setSession] = useState(undefined)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Wachtwoord moet minimaal 8 tekens hebben.')
    if (password !== confirm) return setError('Wachtwoorden komen niet overeen.')
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      await supabase.auth.signOut()
      window.location.href = '/login?reset=1'
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (session === undefined) return <AuthLayout title="Even geduld…"><div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Laden…</div></AuthLayout>
  if (!session) {
    return (
      <AuthLayout title="Link niet meer geldig">
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Deze herstellink is niet meer geldig. Vraag een nieuwe aan.</p>
        <AuthButton type="button" onClick={() => { window.location.href = '/wachtwoord-vergeten' }}>Nieuwe herstellink aanvragen</AuthButton>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Nieuw wachtwoord instellen">
      <form onSubmit={submit}>
        <AuthField label="Nieuw wachtwoord" index={0}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimaal 8 tekens" required autoFocus />
        </AuthField>
        <AuthField label="Bevestig wachtwoord" index={1}>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" required />
        </AuthField>
        {error && <AuthError>{error}</AuthError>}
        <AuthButton disabled={loading}>{loading ? 'Opslaan…' : 'Wachtwoord opslaan'}</AuthButton>
      </form>
    </AuthLayout>
  )
}
