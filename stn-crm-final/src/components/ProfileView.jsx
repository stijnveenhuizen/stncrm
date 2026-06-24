import React, { useState, useEffect, useRef } from 'react'
import * as db from '../lib/db'
import { supabase } from '../lib/supabase'

const ACCENT_COLORS = [
  { name: 'STN Groen', value: '#3db68e' },
  { name: 'Blauw', value: '#2563eb' },
  { name: 'Paars', value: '#7c3aed' },
  { name: 'Roze', value: '#db2777' },
  { name: 'Oranje', value: '#ea580c' },
  { name: 'Geel', value: '#ca8a04' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Zwart', value: '#1a1a18' },
]

export default function ProfileView({ session, onProfileUpdate }) {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ full_name: '', theme: 'light', accent_color: '#3db68e' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const fileRef = useRef()

  useEffect(() => {
    db.getProfile(session.user.id).then(p => {
      if (p) {
        setProfile(p)
        setForm({ full_name: p.full_name || '', theme: p.theme || 'light', accent_color: p.accent_color || '#3db68e' })
      }
    })
  }, [session.user.id])

  async function saveProfile() {
    setSaving(true)
    setMsg('')
    try {
      const updated = await db.upsertProfile(session.user.id, form)
      setProfile(updated)
      onProfileUpdate(updated)
      setMsg('Profiel opgeslagen!')
      setTimeout(() => setMsg(''), 3000)
    } catch(e) {
      setMsg('Fout: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setMsg('Foto mag max 2MB zijn.'); return }
    setUploading(true)
    setMsg('')
    try {
      const url = await db.uploadAvatar(session.user.id, file)
      const updated = await db.upsertProfile(session.user.id, { ...form, avatar_url: url })
      setProfile(updated)
      onProfileUpdate(updated)
      setMsg('Profielfoto bijgewerkt!')
      setTimeout(() => setMsg(''), 3000)
    } catch(e) {
      setMsg('Fout bij uploaden: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    if (!profile?.organization_id) { setInviteMsg('Fout: geen team-organisatie gevonden voor je account.'); return }
    setInviting(true)
    setInviteMsg('')
    try {
      // Use Supabase magic link instead of admin invite (works without service key)
      const { error } = await supabase.auth.signInWithOtp({
        email: inviteEmail.trim(),
        options: { shouldCreateUser: true, data: { invite_organization_id: profile.organization_id } }
      })
      if (error) throw error
      setInviteMsg('Uitnodiging verstuurd naar ' + inviteEmail)
      setInviteEmail('')
      setTimeout(() => setInviteMsg(''), 5000)
    } catch(e) {
      setInviteMsg('Fout: ' + e.message)
    } finally {
      setInviting(false)
    }
  }

  const initials = form.full_name
    ? form.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : session.user.email[0].toUpperCase()

  return (
    <div>
      <div className="topbar"><h2>Profiel & instellingen</h2></div>
      <div className="content" style={{ maxWidth: 680 }}>

        {/* Avatar + naam */}
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Mijn profiel</span></div>
          <div className="sc-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 24 }}>
              {/* Avatar */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div
                  style={{
                    width: 80, height: 80, borderRadius: '50%',
                    background: form.accent_color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28, fontWeight: 700, color: '#fff',
                    fontFamily: 'var(--heading-font)',
                    overflow: 'hidden',
                    boxShadow: `0 4px 14px ${form.accent_color}44`
                  }}
                >
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : initials
                  }
                </div>
                <button
                  onClick={() => fileRef.current.click()}
                  disabled={uploading}
                  style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'var(--surface)', border: '2px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, cursor: 'pointer', boxShadow: 'var(--shadow)'
                  }}
                  title="Foto wijzigen"
                >{uploading ? '…' : '✎'}</button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--heading-font)', fontWeight: 600, fontSize: 18 }}>
                  {form.full_name || 'Jouw naam'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{session.user.email}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                  Klik op het potloodje om je foto te wijzigen
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Volledige naam</label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                placeholder="Jan de Vries"
              />
            </div>

            {msg && (
              <div style={{
                background: msg.startsWith('Fout') ? 'var(--red-soft)' : 'var(--green-soft)',
                color: msg.startsWith('Fout') ? 'var(--red-text)' : 'var(--green-text)',
                borderRadius: 'var(--rsm)', padding: '9px 12px', fontSize: 13, marginBottom: 14
              }}>{msg}</div>
            )}

            <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
              {saving ? 'Opslaan…' : 'Profiel opslaan'}
            </button>
          </div>
        </div>

        {/* Thema */}
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Weergave</span></div>
          <div className="sc-body">
            <div className="form-group">
              <label>Thema</label>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                {['light', 'dark'].map(t => (
                  <div
                    key={t}
                    onClick={() => setForm(p => ({ ...p, theme: t }))}
                    style={{
                      flex: 1, padding: '14px 16px', borderRadius: 'var(--r)', cursor: 'pointer',
                      border: `2px solid ${form.theme === t ? form.accent_color : 'var(--border)'}`,
                      background: t === 'dark' ? '#111110' : '#ffffff',
                      display: 'flex', alignItems: 'center', gap: 10,
                      transition: 'border .15s'
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: `2px solid ${form.theme === t ? form.accent_color : 'var(--border-strong)'}`,
                      background: form.theme === t ? form.accent_color : 'transparent',
                      flexShrink: 0
                    }}></div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: t === 'dark' ? '#f0f0ee' : '#0f0f0e' }}>
                      {t === 'light' ? '☀ Licht' : '🌙 Donker'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 20 }}>
              <label>Accentkleur</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                {ACCENT_COLORS.map(c => (
                  <div
                    key={c.value}
                    onClick={() => setForm(p => ({ ...p, accent_color: c.value }))}
                    title={c.name}
                    style={{
                      width: 32, height: 32, borderRadius: '50%', background: c.value,
                      cursor: 'pointer', transition: 'transform .12s',
                      border: `3px solid ${form.accent_color === c.value ? 'var(--text)' : 'transparent'}`,
                      boxShadow: form.accent_color === c.value ? `0 0 0 2px var(--surface), 0 0 0 4px ${c.value}` : 'none',
                      transform: form.accent_color === c.value ? 'scale(1.15)' : 'scale(1)'
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
                {saving ? 'Opslaan…' : 'Instellingen opslaan'}
              </button>
            </div>
          </div>
        </div>

        {/* Gebruikers uitnodigen */}
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Gebruikers uitnodigen</span></div>
          <div className="sc-body">
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Stuur een uitnodigingslink naar een collega. Zij kunnen daarna inloggen en het dashboard gebruiken.
            </p>
            <form onSubmit={handleInvite} style={{ display: 'flex', gap: 10 }}>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="collega@bedrijf.nl"
                style={{ flex: 1 }}
                required
              />
              <button type="submit" className="btn btn-primary" disabled={inviting} style={{ flexShrink: 0 }}>
                {inviting ? 'Versturen…' : 'Uitnodigen'}
              </button>
            </form>
            {inviteMsg && (
              <div style={{
                background: inviteMsg.startsWith('Fout') ? 'var(--red-soft)' : 'var(--green-soft)',
                color: inviteMsg.startsWith('Fout') ? 'var(--red-text)' : 'var(--green-text)',
                borderRadius: 'var(--rsm)', padding: '9px 12px', fontSize: 13, marginTop: 12
              }}>{inviteMsg}</div>
            )}
            <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg2)', borderRadius: 'var(--rsm)', fontSize: 12, color: 'var(--text-muted)' }}>
              De uitgenodigde persoon ontvangt een e-mail met een inloglink. Ze hoeven geen wachtwoord in te stellen — de link logt ze direct in.
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="sc">
          <div className="sc-head"><span className="sc-title">Account</span></div>
          <div className="sc-body">
            <div className="info-row">
              <span className="info-label">E-mailadres</span>
              <span className="info-val">{session.user.email}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Gebruiker ID</span>
              <span className="info-val" style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-faint)' }}>{session.user.id}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Aangemaakt</span>
              <span className="info-val">{new Date(session.user.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
