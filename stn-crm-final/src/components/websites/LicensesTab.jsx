import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as db from '../../lib/db'
import { money, fdate, daysN, showToast } from '../Dashboard.jsx'

const CATEGORY_LABEL = { plugin: 'Plugin', theme: 'Theme', hosting: 'Hosting', tool: 'Tool', domein: 'Domein', ssl: 'SSL', overig: 'Overig' }

function renewalColor(date) {
  if (!date) return 'var(--text-muted-tok)'
  const d = daysN(date)
  if (d < 14) return 'var(--danger)'
  if (d < 30) return 'var(--warning)'
  return 'var(--success)'
}

export default function LicensesTab({ clients, allHosting, activeOrgId }) {
  const [licenses, setLicenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('alle')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailLicense, setDetailLicense] = useState(null)

  const refresh = () => { if (activeOrgId) db.getLicenses(activeOrgId).then(l => { setLicenses(l); setLoading(false) }).catch(() => setLoading(false)) }
  useEffect(() => { refresh() }, [activeOrgId])

  const filtered = licenses.filter(l => {
    if (filter === 'alle') return true
    if (filter === 'plugins') return l.category === 'plugin'
    if (filter === 'hosting') return l.category === 'hosting'
    if (filter === 'tools') return l.category === 'tool'
    if (filter === 'bureau') return l.paid_by === 'bureau'
    if (filter === 'klant') return l.paid_by === 'klant'
    return true
  })

  const yearlyAmount = l => {
    if (l.billing_cycle === 'maandelijks') return Number(l.price || 0) * 12
    if (l.billing_cycle === 'jaarlijks') return Number(l.price || 0)
    return 0
  }
  const totalYearly = licenses.reduce((s, l) => s + yearlyAmount(l), 0)
  const paidByClients = licenses.filter(l => l.paid_by === 'klant').reduce((s, l) => s + yearlyAmount(l), 0)
  const expiringSoon = licenses.filter(l => l.renewal_date && daysN(l.renewal_date) <= 30 && daysN(l.renewal_date) >= 0).length

  const byCategory = useMemo(() => {
    const m = {}
    licenses.forEach(l => { m[l.category] = (m[l.category] || 0) + yearlyAmount(l) })
    return m
  }, [licenses])

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'var(--heading-font)', fontSize: 16, fontWeight: 700 }}>Licenties & abonnementen</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>+ Licentie toevoegen</button>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {[['alle', 'Alles'], ['plugins', 'Plugins'], ['hosting', 'Hosting'], ['tools', 'Tools'], ['bureau', 'Mijn bureau'], ['klant', 'Per klant']].map(([k, label]) => (
          <button key={k} className={`tab${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-label">Totaal</div><div className="stat-value">{licenses.length}</div></div>
        <div className="stat-card"><div className="stat-label">Verloopt &lt; 30 dagen</div><div className="stat-value" style={{ color: expiringSoon > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{expiringSoon}</div></div>
        <div className="stat-card"><div className="stat-label">Jaarlijkse kosten</div><div className="stat-value" style={{ fontSize: 18 }}>{money(totalYearly)}</div></div>
        <div className="stat-card"><div className="stat-label">Betaald door klanten</div><div className="stat-value" style={{ fontSize: 18 }}>{money(paidByClients)}</div></div>
      </div>

      <div className="sc" style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 0.9fr 0.7fr 0.7fr 0.8fr', padding: '8px 16px', background: 'var(--bg-subtle)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted-tok)', textTransform: 'uppercase' }}>
          <div>Naam</div><div>Categorie</div><div>Klant</div><div>Verlenging</div><div>Prijs</div><div>Cycle</div><div>Betaald door</div>
        </div>
        {!loading && !filtered.length ? <div className="empty">Geen licenties gevonden</div> : filtered.map(l => (
          <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr 0.9fr 0.7fr 0.7fr 0.8fr', padding: '10px 16px', borderTop: '1px solid var(--border-default)', fontSize: 13, alignItems: 'center', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => setDetailLicense(l)}>
            <div>{l.name}</div>
            <div><span className="badge bg-gray">{CATEGORY_LABEL[l.category]}</span></div>
            <div style={{ color: 'var(--text-secondary)' }}>{l.clients ? `${l.clients.fname} ${l.clients.lname}` : 'Mijn bureau'}</div>
            {l.renewal_date ? (
              <RenewalCell date={l.renewal_date} />
            ) : <div style={{ color: 'var(--text-muted-tok)' }}>—</div>}
            <div style={{ fontFamily: 'var(--mono-font)' }}>{money(l.price || 0)}</div>
            <div style={{ color: 'var(--text-secondary)' }}>{l.billing_cycle}</div>
            <div style={{ color: 'var(--text-secondary)' }}>{l.paid_by === 'bureau' ? 'Bureau' : 'Klant'}</div>
          </div>
        ))}
      </div>

      <div className="sc">
        <div className="sc-head"><span className="sc-title">Kostenoverzicht</span></div>
        <div className="sc-body">
          {Object.entries(byCategory).map(([cat, amount]) => (
            <div key={cat} className="info-row"><span className="info-label">{CATEGORY_LABEL[cat]}</span><span className="info-val" style={{ fontFamily: 'var(--mono-font)' }}>{money(amount)}/jaar</span></div>
          ))}
          <div style={{ borderTop: '1px solid var(--border-default)', marginTop: 8, paddingTop: 8 }}>
            <div className="info-row"><span className="info-label">Betaald door bureau</span><span className="info-val" style={{ fontFamily: 'var(--mono-font)' }}>{money(totalYearly - paidByClients)}/jaar</span></div>
            <div className="info-row"><span className="info-label">Doorberekend aan klanten</span><span className="info-val" style={{ fontFamily: 'var(--mono-font)' }}>{money(paidByClients)}/jaar</span></div>
            <div className="info-row"><span className="info-label">Netto kosten bureau</span><span className="info-val" style={{ fontFamily: 'var(--mono-font)', fontWeight: 700 }}>{money(totalYearly - paidByClients)}/jaar</span></div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {createOpen && <LicenseFormModal clients={clients} allHosting={allHosting} activeOrgId={activeOrgId} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); refresh() }} />}
      </AnimatePresence>
      <AnimatePresence>
        {detailLicense && <LicenseDetailPanel license={detailLicense} clients={clients} allHosting={allHosting} onClose={() => setDetailLicense(null)} onRefresh={refresh} />}
      </AnimatePresence>
    </div>
  )
}

function RenewalCell({ date }) {
  const expired = daysN(date) < 0
  return (
    <motion.div animate={expired ? { borderColor: ['#DC2626', '#FCA5A5', '#DC2626'] } : {}} transition={{ duration: 2, repeat: Infinity }}
      style={{ display: 'inline-flex', border: expired ? '1px solid' : 'none', borderRadius: 6, padding: expired ? '2px 6px' : 0, color: renewalColor(date), fontWeight: 500 }}>
      {fdate(date)}
    </motion.div>
  )
}

function LicenseFormModal({ clients, allHosting, activeOrgId, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', category: 'plugin', vendor: '', license_key: '', seats: '', price: '', billing_cycle: 'jaarlijks', renewal_date: '', auto_renews: true, paid_by: 'bureau', client_id: '', site_id: '', login_url: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function save() {
    if (!form.name.trim()) return showToast('Vul een naam in.', 'error')
    setSaving(true)
    try {
      await db.createLicense({
        workspace_id: activeOrgId, client_id: form.client_id || null, site_id: form.site_id || null, name: form.name.trim(),
        category: form.category, vendor: form.vendor || null, license_key: form.license_key || null,
        seats: form.seats ? parseInt(form.seats) : null, price: form.price ? parseFloat(form.price) : 0,
        billing_cycle: form.billing_cycle, renewal_date: form.renewal_date || null, auto_renews: form.auto_renews,
        paid_by: form.paid_by, login_url: form.login_url || null, notes: form.notes || null,
      })
      showToast('Licentie toegevoegd')
      onSaved()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }}>
        <h3>Licentie toevoegen</h3>
        <div className="form-row">
          <div className="form-group"><label>Naam</label><input value={form.name} onChange={f('name')} placeholder="bijv. Elementor Pro" autoFocus /></div>
          <div className="form-group"><label>Categorie</label><select value={form.category} onChange={f('category')}>{Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Leverancier</label><input value={form.vendor} onChange={f('vendor')} /></div>
          <div className="form-group"><label>License key (optioneel)</label><input value={form.license_key} onChange={f('license_key')} type="password" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Prijs (€)</label><input type="number" value={form.price} onChange={f('price')} /></div>
          <div className="form-group"><label>Cycle</label><select value={form.billing_cycle} onChange={f('billing_cycle')}><option value="eenmalig">Eenmalig</option><option value="maandelijks">Maandelijks</option><option value="jaarlijks">Jaarlijks</option></select></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Verlengingsdatum</label><input type="date" value={form.renewal_date} onChange={f('renewal_date')} /></div>
          <div className="form-group"><label>Betaald door</label><select value={form.paid_by} onChange={f('paid_by')}><option value="bureau">Bureau</option><option value="klant">Klant</option></select></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Klant (optioneel)</label><select value={form.client_id} onChange={f('client_id')}><option value="">— Mijn bureau —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.fname} {c.lname}</option>)}</select></div>
          <div className="form-group"><label>Site (optioneel)</label><select value={form.site_id} onChange={f('site_id')}><option value="">—</option>{allHosting.map(h => <option key={h.id} value={h.id}>{h.site_name}</option>)}</select></div>
        </div>
        <div className="form-group"><label>Login URL (optioneel)</label><input value={form.login_url} onChange={f('login_url')} placeholder="https://" /></div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Toevoegen'}</button>
        </div>
      </motion.div>
    </div>
  )
}

function LicenseDetailPanel({ license, clients, allHosting, onClose, onRefresh }) {
  const [form, setForm] = useState({
    name: license.name, vendor: license.vendor || '', price: license.price || '', billing_cycle: license.billing_cycle,
    renewal_date: license.renewal_date || '', auto_renews: license.auto_renews, paid_by: license.paid_by, login_url: license.login_url || '', notes: license.notes || '',
  })
  const [revealedKey, setRevealedKey] = useState(null)
  const [saving, setSaving] = useState(false)
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function save() {
    setSaving(true)
    try { await db.updateLicense(license.id, { ...form, price: parseFloat(form.price) || 0 }); onRefresh(); showToast('Opgeslagen') }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }
  async function revealKey() {
    try {
      const key = await db.getDecryptedLicenseKey(license.id)
      if (!key) { showToast('Geen license key opgeslagen.', 'error'); return }
      setRevealedKey(key)
      navigator.clipboard?.writeText(key)
      showToast('License key gekopieerd naar klembord')
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  async function remove() {
    if (!confirm('Licentie verwijderen?')) return
    try { await db.deleteLicense(license.id); onRefresh(); onClose() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} onClick={onClose} />
      <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ position: 'relative', width: 520, maxWidth: '100vw', height: '100%', background: 'var(--bg-base)', boxShadow: '-8px 0 30px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--heading-font)' }}>{license.name}</div>
          <button onClick={onClose} aria-label="Sluiten" style={{ fontSize: 20, color: 'var(--text-faint)', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          <div className="form-row">
            <div className="form-group"><label>Naam</label><input value={form.name} onChange={f('name')} /></div>
            <div className="form-group"><label>Leverancier</label><input value={form.vendor} onChange={f('vendor')} /></div>
          </div>
          <div className="form-group">
            <label>License key</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={revealedKey || '••••••••••••'} readOnly style={{ fontFamily: 'var(--mono-font)' }} />
              <button className="btn btn-ghost btn-sm" onClick={revealKey} style={{ flexShrink: 0 }}>Toon &amp; kopieer</button>
            </div>
          </div>
          {form.login_url && <div className="form-group"><a href={form.login_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Open beheeromgeving →</a></div>}
          {!form.login_url && <div className="form-group"><label>Login URL</label><input value={form.login_url} onChange={f('login_url')} placeholder="https://" /></div>}
          <div className="form-row">
            <div className="form-group"><label>Prijs (€)</label><input type="number" value={form.price} onChange={f('price')} /></div>
            <div className="form-group"><label>Cycle</label><select value={form.billing_cycle} onChange={f('billing_cycle')}><option value="eenmalig">Eenmalig</option><option value="maandelijks">Maandelijks</option><option value="jaarlijks">Jaarlijks</option></select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Verlengingsdatum</label><input type="date" value={form.renewal_date} onChange={f('renewal_date')} /></div>
            <div className="form-group"><label>Betaald door</label><select value={form.paid_by} onChange={f('paid_by')}><option value="bureau">Bureau</option><option value="klant">Klant</option></select></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, textTransform: 'none', cursor: 'pointer', marginBottom: 14 }}>
            <input type="checkbox" checked={form.auto_renews} onChange={f('auto_renews')} style={{ width: 15, height: 15 }} /> Automatische verlenging
          </label>
          <div className="form-group"><label>Notities</label><textarea value={form.notes} onChange={f('notes')} rows={3} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
            <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={remove}>Verwijderen</button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
