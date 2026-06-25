import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as db from '../../lib/db'
import { money, fdate, today, showToast, Badge } from '../Dashboard.jsx'

const CATEGORY_LABEL = { update: 'Update', security: 'Beveiliging', backup: 'Backup', design: 'Ontwerp', content: 'Content', overig: 'Overig' }
const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

export default function MaintenanceTab({ activeOrgId, clients, allHosting, companySettings }) {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [detailContract, setDetailContract] = useState(null)

  const refresh = () => { if (activeOrgId) db.getMaintenanceContracts(activeOrgId).then(c => { setContracts(c); setLoading(false) }).catch(() => setLoading(false)) }
  useEffect(() => { refresh() }, [activeOrgId])

  const active = contracts.filter(c => c.status === 'actief')
  const mrr = active.reduce((s, c) => {
    if (c.billing_cycle === 'maandelijks') return s + Number(c.fixed_price || 0)
    if (c.billing_cycle === 'kwartaal') return s + Number(c.fixed_price || 0) / 3
    if (c.billing_cycle === 'jaarlijks') return s + Number(c.fixed_price || 0) / 12
    return s
  }, 0)

  const now = new Date()
  const [hoursThisMonth, setHoursThisMonth] = useState(0)
  const [reportsDue, setReportsDue] = useState(0)
  useEffect(() => {
    if (!active.length) { setHoursThisMonth(0); setReportsDue(0); return }
    Promise.all(active.map(c => db.getMaintenanceLogs(c.id))).then(allLogs => {
      let hours = 0
      allLogs.flat().forEach(l => {
        const d = new Date(l.date)
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) hours += Number(l.hours_spent || 0)
      })
      setHoursThisMonth(hours)
    })
    Promise.all(active.map(c => db.getMaintenanceReports(c.id))).then(allReports => {
      const due = active.filter((c, i) => !allReports[i].some(r => r.period_month === now.getMonth() + 1 && r.period_year === now.getFullYear())).length
      setReportsDue(due)
    })
  }, [contracts])

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--heading-font)', fontSize: 16, fontWeight: 700 }}>Onderhoudscontracten</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>+ Nieuw contract</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-label">Actieve contracten</div><div className="stat-value">{active.length}</div></div>
        <div className="stat-card"><div className="stat-label">MRR onderhoud</div><div className="stat-value" style={{ fontSize: 18 }}>{money(mrr)}</div></div>
        <div className="stat-card"><div className="stat-label">Uren deze maand</div><div className="stat-value">{hoursThisMonth}</div></div>
        <div className="stat-card"><div className="stat-label">Rapporten te sturen</div><div className="stat-value" style={{ color: reportsDue > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{reportsDue}</div></div>
      </div>

      <div className="sc" style={{ padding: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 0.8fr 0.8fr 0.8fr 0.6fr', padding: '8px 16px', background: 'var(--bg-subtle)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted-tok)', textTransform: 'uppercase' }}>
          <div>Klant</div><div>Site</div><div>Naam</div><div>Cycle</div><div>Bedrag</div><div>Status</div><div></div>
        </div>
        {!loading && !contracts.length ? (
          <div className="empty">Nog geen onderhoudscontracten. Maak er een aan om werkzaamheden bij te houden.</div>
        ) : contracts.map(c => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr 0.8fr 0.8fr 0.8fr 0.6fr', padding: '10px 16px', borderTop: '1px solid var(--border-default)', fontSize: 13, alignItems: 'center', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-subtle)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            onClick={() => setDetailContract(c)}>
            <div>{c.clients ? `${c.clients.fname} ${c.clients.lname}` : '—'}</div>
            <div style={{ color: 'var(--text-secondary)' }}>{c.hosting?.site_name || '—'}</div>
            <div>{c.name}</div>
            <div style={{ color: 'var(--text-secondary)' }}>{c.billing_cycle}</div>
            <div style={{ fontFamily: 'var(--mono-font)' }}>{money(c.fixed_price || 0)}</div>
            <div><Badge s={c.status} /></div>
            <div></div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {createOpen && <ContractFormModal clients={clients} allHosting={allHosting} activeOrgId={activeOrgId} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); refresh() }} />}
      </AnimatePresence>
      <AnimatePresence>
        {detailContract && <ContractDetailPanel contract={detailContract} companySettings={companySettings} onClose={() => setDetailContract(null)} onRefresh={refresh} />}
      </AnimatePresence>
    </div>
  )
}

function ContractFormModal({ clients, allHosting, activeOrgId, onClose, onSaved }) {
  const [form, setForm] = useState({ client_id: '', site_id: '', name: '', billing_cycle: 'maandelijks', fixed_price: '', hours_per_month: '', includes_hosting: false, includes_backups: false, includes_updates: true, includes_security: false, notes: '' })
  const [saving, setSaving] = useState(false)
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function save() {
    if (!form.client_id || !form.name.trim()) return showToast('Vul klant en naam in.', 'error')
    setSaving(true)
    try {
      await db.createMaintenanceContract({
        workspace_id: activeOrgId, client_id: form.client_id, site_id: form.site_id || null, name: form.name.trim(),
        billing_cycle: form.billing_cycle, fixed_price: form.fixed_price ? parseFloat(form.fixed_price) : null,
        hours_per_month: form.hours_per_month ? parseFloat(form.hours_per_month) : null,
        includes_hosting: form.includes_hosting, includes_backups: form.includes_backups, includes_updates: form.includes_updates, includes_security: form.includes_security,
        notes: form.notes || null,
      })
      showToast('Contract aangemaakt')
      onSaved()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }}>
        <h3>Nieuw onderhoudscontract</h3>
        <div className="form-row">
          <div className="form-group"><label>Klant</label><select value={form.client_id} onChange={f('client_id')}><option value="">— Kies een klant —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.fname} {c.lname}</option>)}</select></div>
          <div className="form-group"><label>Site (optioneel)</label><select value={form.site_id} onChange={f('site_id')}><option value="">—</option>{allHosting.filter(h => h.client_id === form.client_id).map(h => <option key={h.id} value={h.id}>{h.site_name}</option>)}</select></div>
        </div>
        <div className="form-group"><label>Naam</label><input value={form.name} onChange={f('name')} placeholder="bijv. WordPress onderhoud basis" autoFocus /></div>
        <div className="form-row">
          <div className="form-group"><label>Cycle</label><select value={form.billing_cycle} onChange={f('billing_cycle')}><option value="maandelijks">Maandelijks</option><option value="kwartaal">Kwartaal</option><option value="jaarlijks">Jaarlijks</option></select></div>
          <div className="form-group"><label>Bedrag (€)</label><input type="number" value={form.fixed_price} onChange={f('fixed_price')} /></div>
        </div>
        <div className="form-group"><label>Uren per maand (optioneel)</label><input type="number" step="0.5" value={form.hours_per_month} onChange={f('hours_per_month')} /></div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          {[['includes_hosting', 'Hosting'], ['includes_backups', 'Backups'], ['includes_updates', 'Updates'], ['includes_security', 'Beveiliging']].map(([k, label]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, textTransform: 'none', cursor: 'pointer' }}>
              <input type="checkbox" checked={form[k]} onChange={f(k)} style={{ width: 15, height: 15 }} /> {label}
            </label>
          ))}
        </div>
        <div className="form-group"><label>Notities</label><textarea value={form.notes} onChange={f('notes')} rows={2} /></div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Aanmaken'}</button>
        </div>
      </motion.div>
    </div>
  )
}

function ContractDetailPanel({ contract, companySettings, onClose, onRefresh }) {
  const [tab, setTab] = useState('info')
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} onClick={onClose} />
      <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ position: 'relative', width: 580, maxWidth: '100vw', height: '100%', background: 'var(--bg-base)', boxShadow: '-8px 0 30px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--heading-font)' }}>{contract.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{contract.clients ? `${contract.clients.fname} ${contract.clients.lname}` : ''}</div>
          </div>
          <button onClick={onClose} aria-label="Sluiten" style={{ fontSize: 20, color: 'var(--text-faint)', cursor: 'pointer' }}>×</button>
        </div>
        <div className="tabs" style={{ margin: '14px 24px 0' }}>
          {[['info', 'Info'], ['logboek', 'Logboek'], ['rapporten', 'Rapporten']].map(([t, label]) => (
            <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {tab === 'info' && <ContractInfoTab contract={contract} onRefresh={onRefresh} />}
          {tab === 'logboek' && <LogboekTab contract={contract} />}
          {tab === 'rapporten' && <RapportenTab contract={contract} companySettings={companySettings} />}
        </div>
      </motion.div>
    </div>
  )
}

function ContractInfoTab({ contract, onRefresh }) {
  const [status, setStatus] = useState(contract.status)
  async function changeStatus(s) {
    setStatus(s)
    try { await db.updateMaintenanceContract(contract.id, { status: s }); onRefresh() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }
  return (
    <div>
      <div className="sc">
        <div className="sc-body">
          <div className="info-row"><span className="info-label">Status</span><span className="info-val"><select value={status} onChange={e => changeStatus(e.target.value)} style={{ width: 'auto' }}><option value="actief">Actief</option><option value="gepauzeerd">Gepauzeerd</option><option value="gestopt">Gestopt</option></select></span></div>
          <div className="info-row"><span className="info-label">Cycle</span><span className="info-val">{contract.billing_cycle}</span></div>
          <div className="info-row"><span className="info-label">Bedrag</span><span className="info-val">{money(contract.fixed_price || 0)}</span></div>
          {contract.hours_per_month && <div className="info-row"><span className="info-label">Uren/maand</span><span className="info-val">{contract.hours_per_month}</span></div>}
          <div className="info-row"><span className="info-label">Inbegrepen</span><span className="info-val">{[contract.includes_hosting && 'Hosting', contract.includes_backups && 'Backups', contract.includes_updates && 'Updates', contract.includes_security && 'Beveiliging'].filter(Boolean).join(', ') || '—'}</span></div>
          <div className="info-row"><span className="info-label">Startdatum</span><span className="info-val">{fdate(contract.start_date)}</span></div>
          {contract.notes && <div className="info-row"><span className="info-label">Notities</span><span className="info-val">{contract.notes}</span></div>}
        </div>
      </div>
    </div>
  )
}

function LogboekTab({ contract }) {
  const [logs, setLogs] = useState([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ date: today(), category: 'update', title: '', description: '', hours_spent: '' })
  const [saving, setSaving] = useState(false)
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const refresh = () => db.getMaintenanceLogs(contract.id).then(setLogs)
  useEffect(() => { refresh() }, [contract.id])

  const now = new Date()
  const usedThisMonth = logs.filter(l => { const d = new Date(l.date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() }).reduce((s, l) => s + Number(l.hours_spent || 0), 0)
  const pct = contract.hours_per_month ? Math.min(100, Math.round(usedThisMonth / contract.hours_per_month * 100)) : null

  async function save() {
    if (!form.title.trim()) return showToast('Vul een titel in.', 'error')
    setSaving(true)
    try {
      await db.createMaintenanceLog({ contract_id: contract.id, date: form.date, category: form.category, title: form.title.trim(), description: form.description || null, hours_spent: form.hours_spent ? parseFloat(form.hours_spent) : null })
      setForm({ date: today(), category: 'update', title: '', description: '', hours_spent: '' }); setOpen(false); refresh()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }
  async function removeLog(id) {
    if (!confirm('Werkzaamheid verwijderen?')) return
    try { await db.deleteMaintenanceLog(id); refresh() } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  return (
    <div>
      {contract.hours_per_month && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{usedThisMonth} van {contract.hours_per_month} uren gebruikt deze maand</div>
          <div style={{ height: 6, background: 'var(--bg-subtle)', borderRadius: 99 }}><div style={{ height: '100%', width: pct + '%', background: pct >= 100 ? 'var(--danger)' : 'var(--accent)', borderRadius: 99 }}></div></div>
        </div>
      )}
      {!open
        ? <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} style={{ marginBottom: 14 }}>+ Werkzaamheid loggen</button>
        : (
          <motion.div initial={{ opacity: 0, x: -16, height: 0 }} animate={{ opacity: 1, x: 0, height: 'auto' }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 14, marginBottom: 14, overflow: 'hidden' }}>
            <div className="form-row">
              <div className="form-group"><label>Datum</label><input type="date" value={form.date} onChange={f('date')} /></div>
              <div className="form-group"><label>Categorie</label><select value={form.category} onChange={f('category')}>{Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            </div>
            <div className="form-group"><label>Titel</label><input value={form.title} onChange={f('title')} autoFocus /></div>
            <div className="form-group"><label>Beschrijving (optioneel)</label><textarea value={form.description} onChange={f('description')} rows={2} /></div>
            <div className="form-group"><label>Uren</label><input type="number" step="0.25" value={form.hours_spent} onChange={f('hours_spent')} /></div>
            <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setOpen(false)}>Annuleren</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button></div>
          </motion.div>
        )}
      {!logs.length ? <div className="empty">Nog geen werkzaamheden gelogd</div> : logs.map(l => (
        <div key={l.id} className="dl-item" style={{ alignItems: 'flex-start' }}>
          <span className="badge bg-gray" style={{ flexShrink: 0 }}>{CATEGORY_LABEL[l.category]}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{l.title}</div>
            {l.description && <div style={{ fontSize: 12, color: 'var(--text-muted-tok)' }}>{l.description}</div>}
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fdate(l.date)}{l.hours_spent ? ` · ${l.hours_spent}u` : ''}</div>
          </div>
          <button type="button" className="task-del" onClick={() => removeLog(l.id)} aria-label="Verwijderen">×</button>
        </div>
      ))}
    </div>
  )
}

function RapportenTab({ contract, companySettings }) {
  const [reports, setReports] = useState([])
  const [generating, setGenerating] = useState(false)
  const refresh = () => db.getMaintenanceReports(contract.id).then(setReports)
  useEffect(() => { refresh() }, [contract.id])

  const now = new Date()
  async function generate() {
    setGenerating(true)
    try {
      await db.generateMaintenanceReport(contract.id, now.getMonth() + 1, now.getFullYear())
      showToast('Rapport gegenereerd')
      refresh()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setGenerating(false) }
  }
  async function openReport(r) {
    try { const url = await db.getMaintenanceReportUrl(r.pdf_url); window.open(url, '_blank') }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  return (
    <div>
      <button className="btn btn-primary btn-sm" onClick={generate} disabled={generating} style={{ marginBottom: 14 }}>
        {generating ? 'Genereren…' : `Rapport genereren voor ${MONTHS[now.getMonth()]} ${now.getFullYear()}`}
      </button>
      {!reports.length ? <div className="empty">Nog geen rapporten gegenereerd</div> : reports.map(r => (
        <div key={r.id} className="info-row" style={{ alignItems: 'center' }}>
          <span className="info-val" style={{ flex: 1 }}>{MONTHS[r.period_month - 1]} {r.period_year}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted-tok)', marginRight: 8 }}>{fdate(r.generated_at?.slice(0, 10))}</span>
          {r.pdf_url ? <button className="btn btn-ghost btn-xs" onClick={() => openReport(r)}>PDF</button> : <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>geen PDF</span>}
        </div>
      ))}
    </div>
  )
}
