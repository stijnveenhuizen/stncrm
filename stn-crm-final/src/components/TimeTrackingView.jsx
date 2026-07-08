import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as db from '../lib/db'
import { money, fdate, today, showToast, EmptyState, EmptyIcons } from './Dashboard.jsx'

const fmtHM = m => `${Math.floor((m || 0) / 60)}u ${(m || 0) % 60}m`
const fmtHM2 = ms => {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function SidebarTimerTicker({ startedAt }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  if (!startedAt) return null
  const elapsed = now - new Date(startedAt).getTime()
  const s = Math.floor(elapsed / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--mono-font, monospace)', fontSize: 11, color: 'var(--accent)' }}>
      <motion.span animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
        style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
    </span>
  )
}

export default function TimeTrackingView({ projects = [], clients = [], allTimeEntries = [], activeOrgId, currentUserId, currentUserName, companySettings, onRefresh, runningTimer, onRunningTimerChange }) {
  const [range, setRange] = useState('week')
  const [showStart, setShowStart] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [stopping, setStopping] = useState(false)

  const projectById = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects])
  const clientByProjectId = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p.clients])), [projects])

  async function stopRunningTimer() {
    if (!runningTimer) return
    setStopping(true)
    try {
      await db.stopTimer(runningTimer.id)
      onRunningTimerChange(null)
      onRefresh()
      showToast('Timer gestopt')
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setStopping(false) }
  }

  // ── KPI's ──────────────────────────────────────────────────────────────────
  const now = new Date()
  const startOfWeek = (() => { const d = new Date(now); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d })()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const minutesSince = date => allTimeEntries.filter(e => e.date && new Date(e.date) >= date).reduce((s, e) => s + (e.minutes || 0), 0)
  const minutesToday = allTimeEntries.filter(e => e.date === today()).reduce((s, e) => s + (e.minutes || 0), 0)
  const minutesWeek = minutesSince(startOfWeek)
  const minutesMonth = minutesSince(startOfMonth)
  const uninvoicedAmount = allTimeEntries.filter(e => e.is_billable && !e.is_invoiced).reduce((s, e) => s + (e.minutes || 0) / 60 * (e.hourly_rate || 0), 0)

  // ── Tijdlijn ───────────────────────────────────────────────────────────────
  const rangeStart = range === 'day' ? new Date(new Date().setHours(0, 0, 0, 0)) : range === 'week' ? startOfWeek : startOfMonth
  // Een lopende timer (started_at gezet, ended_at nog null) staat al in de banner
  // bovenaan en hoort niet nogmaals als losse regel in de tijdlijn te verschijnen.
  const visible = allTimeEntries.filter(e => e.date && new Date(e.date) >= rangeStart && (e.ended_at || !e.started_at))

  const byDay = useMemo(() => {
    const groups = {}
    for (const e of visible) {
      const key = e.date
      if (!groups[key]) groups[key] = []
      groups[key].push(e)
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
  }, [visible])

  async function deleteEntry(id) {
    if (!window.confirm('Deze tijdregistratie verwijderen?')) return
    try { await db.deleteTimeEntry(id); onRefresh(); showToast('Verwijderd') }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontFamily: 'var(--heading-font)', fontSize: 16, fontWeight: 700 }}>Tijdregistratie</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowExport(true)}>Exporteer naar factuur</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowManual(true)}>+ Handmatig toevoegen</button>
          {!runningTimer && <button className="btn btn-primary btn-sm" onClick={() => setShowStart(true)}>▶ Start timer</button>}
        </div>
      </div>

      <AnimatePresence>
        {runningTimer && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md, var(--r))', padding: '12px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <motion.span animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
              <RunningClock startedAt={runningTimer.started_at} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Project: <strong>{runningTimer.projects?.name || '—'}</strong></span>
              {runningTimer.description && <span style={{ fontSize: 13, color: 'var(--text-muted-tok)' }}>"{runningTimer.description}"</span>}
            </div>
            <button className="btn btn-primary btn-sm" onClick={stopRunningTimer} disabled={stopping}>{stopping ? '…' : '■ Stop'}</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-label">Vandaag</div><div className="stat-value">{fmtHM(minutesToday)}</div></div>
        <div className="stat-card"><div className="stat-label">Deze week</div><div className="stat-value">{fmtHM(minutesWeek)}</div></div>
        <div className="stat-card"><div className="stat-label">Deze maand</div><div className="stat-value">{fmtHM(minutesMonth)}</div></div>
        <div className="stat-card"><div className="stat-label">Niet gefactureerd</div><div className="stat-value">{money(uninvoicedAmount)}</div></div>
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {[['day', 'Dag'], ['week', 'Week'], ['month', 'Maand']].map(([k, label]) => (
          <button key={k} className={`tab${range === k ? ' active' : ''}`} onClick={() => setRange(k)}>{label}</button>
        ))}
      </div>

      {!byDay.length ? (
        <EmptyState icon={EmptyIcons.time} title="Nog geen uren geregistreerd" sub="Start een timer of voeg uren handmatig toe."
          cta={!runningTimer && <button className="btn btn-primary btn-sm" onClick={() => setShowStart(true)}>▶ Start timer</button>} />
      ) : byDay.map(([date, entries]) => {
        const dayTotal = entries.reduce((s, e) => s + (e.minutes || 0), 0)
        return (
          <div key={date} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text-muted-tok)', textTransform: 'uppercase', marginBottom: 8 }}>
              <span>{fdate(date)}</span><span>{fmtHM(dayTotal)}</span>
            </div>
            <div className="sc" style={{ padding: 0 }}>
              {entries.map((e, i) => {
                const project = e.projects || projectById[e.project_id]
                const client = e.projects?.clients || clientByProjectId[e.project_id]
                return (
                  <motion.div key={e.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i > 0 ? '1px solid var(--border-default)' : 'none' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: project?.color || '#94a3b8', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {project?.name || 'Onbekend project'}{e.description ? ` — ${e.description}` : ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted-tok)', display: 'flex', gap: 8 }}>
                        <span>{client ? `${client.fname || ''} ${client.lname || ''}`.trim() || client.company : ''}</span>
                        <span>{e.is_billable ? '✓ Factureerbaar' : 'Niet factureerbaar'}</span>
                        {e.is_invoiced && <span style={{ color: 'var(--success)' }}>Gefactureerd</span>}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'var(--mono-font, monospace)', fontSize: 13, flexShrink: 0 }}>{fmtHM(e.minutes)}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted-tok)', width: 64, textAlign: 'right', flexShrink: 0 }}>{e.hourly_rate ? money((e.minutes || 0) / 60 * e.hourly_rate) : '—'}</span>
                    <button className="btn btn-ghost btn-xs" onClick={() => setEditEntry(e)} aria-label="Bewerken" title="Bewerken">✏</button>
                    <button className="btn btn-ghost btn-xs" onClick={() => deleteEntry(e.id)} aria-label="Verwijderen" title="Verwijderen">🗑</button>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )
      })}

      <StartTimerModal open={showStart} onClose={() => setShowStart(false)} projects={projects}
        onStarted={t => { onRunningTimerChange(t); setShowStart(false) }} />
      <ManualEntryModal open={showManual || !!editEntry} entry={editEntry} projects={projects} clients={clients} companySettings={companySettings}
        onClose={() => { setShowManual(false); setEditEntry(null) }} onSaved={() => { setShowManual(false); setEditEntry(null); onRefresh() }} />
      <ExportInvoiceModal open={showExport} onClose={() => setShowExport(false)} clients={clients} projects={projects}
        allTimeEntries={allTimeEntries} companySettings={companySettings} onExported={() => { setShowExport(false); onRefresh() }} />
    </div>
  )
}

function RunningClock({ startedAt }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  return <span style={{ fontFamily: 'var(--mono-font, monospace)', fontSize: 20, fontWeight: 700, minWidth: 90 }}>{fmtHM2(now - new Date(startedAt).getTime())}</span>
}

function StartTimerModal({ open, onClose, projects, onStarted }) {
  const [projectId, setProjectId] = useState('')
  const [description, setDescription] = useState('')
  const [starting, setStarting] = useState(false)
  useEffect(() => { if (open) { setProjectId(projects[0]?.id || ''); setDescription('') } }, [open, projects])
  if (!open) return null
  async function start() {
    if (!projectId) return showToast('Kies eerst een project.', 'error')
    setStarting(true)
    try {
      const t = await db.startTimer({ project_id: projectId, description: description.trim() || null })
      onStarted({ ...t, projects: projects.find(p => p.id === projectId) })
      showToast('Timer gestart')
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setStarting(false) }
  }
  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>Timer starten</h3>
        <div className="form-group"><label>Project</label>
          <select value={projectId} onChange={e => setProjectId(e.target.value)} autoFocus>
            <option value="">— Kies een project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Waar werk je aan? (optioneel)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Bijv. Homepage opnieuw stylen" />
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" onClick={start} disabled={starting}>{starting ? 'Starten…' : '▶ Start'}</button>
        </div>
      </div>
    </div>
  )
}

function ManualEntryModal({ open, entry, projects, clients, companySettings, onClose, onSaved }) {
  const [form, setForm] = useState({ project_id: '', description: '', date: today(), hours: '', minutes: '', hourly_rate: '', is_billable: true })
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!open) return
    if (entry) {
      setForm({ project_id: entry.project_id, description: entry.description || '', date: entry.date, hours: String(Math.floor((entry.minutes || 0) / 60)), minutes: String((entry.minutes || 0) % 60), hourly_rate: entry.hourly_rate ?? '', is_billable: entry.is_billable !== false })
    } else {
      const defaultProject = projects[0]
      const client = defaultProject && clients.find(c => c.id === defaultProject.client_id)
      setForm({ project_id: defaultProject?.id || '', description: '', date: today(), hours: '', minutes: '', hourly_rate: db.effectiveHourlyRate(defaultProject, client, companySettings) ?? '', is_billable: true })
    }
  }, [open, entry])

  function selectProject(projectId) {
    const project = projects.find(p => p.id === projectId)
    const client = project && clients.find(c => c.id === project.client_id)
    setForm(f => ({ ...f, project_id: projectId, hourly_rate: f.hourly_rate || db.effectiveHourlyRate(project, client, companySettings) || '' }))
  }

  if (!open) return null

  async function save() {
    if (!form.project_id) return showToast('Kies een project.', 'error')
    const totalMinutes = (parseInt(form.hours || '0', 10) * 60) + parseInt(form.minutes || '0', 10)
    if (!totalMinutes) return showToast('Vul een duur in.', 'error')
    setSaving(true)
    try {
      const payload = { project_id: form.project_id, description: form.description.trim() || null, date: form.date, minutes: totalMinutes, hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null, is_billable: form.is_billable }
      if (entry) await db.updateTimeEntry(entry.id, payload)
      else await db.createTimeEntry(payload)
      onSaved()
      showToast(entry ? 'Tijdregistratie bijgewerkt' : 'Tijd toegevoegd')
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{entry ? 'Tijdregistratie bewerken' : 'Tijd handmatig toevoegen'}</h3>
        <div className="form-group"><label>Project</label>
          <select value={form.project_id} onChange={e => selectProject(e.target.value)}>
            <option value="">— Kies een project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Omschrijving</label>
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Wat heb je gedaan?" />
        </div>
        <div className="form-row">
          <div className="form-group"><label>Datum</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
          <div className="form-group"><label>Duur</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="number" min="0" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="u" style={{ width: '50%' }} />
              <input type="number" min="0" max="59" value={form.minutes} onChange={e => setForm(f => ({ ...f, minutes: e.target.value }))} placeholder="m" style={{ width: '50%' }} />
            </div>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Uurtarief (€)</label><input type="number" step="0.01" min="0" value={form.hourly_rate} onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))} /></div>
          <div className="form-group"><label>Factureerbaar</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34 }}>
              <input type="checkbox" checked={form.is_billable} onChange={e => setForm(f => ({ ...f, is_billable: e.target.checked }))} /> Ja
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  )
}

function ExportInvoiceModal({ open, onClose, clients, projects, allTimeEntries, companySettings, onExported }) {
  const [clientId, setClientId] = useState('')
  const [from, setFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [to, setTo] = useState(today())
  const [exporting, setExporting] = useState(false)
  useEffect(() => { if (open) setClientId(clients[0]?.id || '') }, [open, clients])
  if (!open) return null

  const clientProjectIds = new Set(projects.filter(p => p.client_id === clientId).map(p => p.id))
  const reportEntries = allTimeEntries.filter(e => clientProjectIds.has(e.project_id) && e.ended_at && e.date >= from && e.date <= to)
  const entries = reportEntries.filter(e => e.is_billable && !e.is_invoiced)
  const totalMinutes = entries.reduce((s, e) => s + (e.minutes || 0), 0)
  const totalAmount = entries.reduce((s, e) => s + (e.minutes || 0) / 60 * (e.hourly_rate || 0), 0)
  const client = clients.find(c => c.id === clientId)

  async function doExport() {
    if (!entries.length) return showToast('Geen niet-gefactureerde factureerbare uren in deze periode.', 'error')
    setExporting(true)
    try {
      await db.exportTimeEntriesToInvoice({ clientId, entries, description: `Urenoverzicht ${fdate(from)} – ${fdate(to)}` })
      onExported()
      showToast('Conceptfactuur aangemaakt')
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setExporting(false) }
  }

  function doDownloadReport() {
    if (!reportEntries.length) return showToast('Geen uren in deze periode.', 'error')
    downloadHourReportPdf({ client, entries: reportEntries, from, to, companySettings })
  }

  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>Urenrapport &amp; factuur</h3>
        <div className="form-group"><label>Klant</label>
          <select value={clientId} onChange={e => setClientId(e.target.value)}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.fname} {c.lname}{c.company ? ` (${c.company})` : ''}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group"><label>Van</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="form-group"><label>Tot</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        </div>
        <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--r)', padding: '10px 12px', fontSize: 13, marginBottom: 4 }}>
          {entries.length} niet-gefactureerde regel(s) — {fmtHM(totalMinutes)} — <strong>{money(totalAmount)}</strong>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-ghost" onClick={doDownloadReport}>Download rapport</button>
          <button className="btn btn-primary" onClick={doExport} disabled={exporting}>{exporting ? 'Bezig…' : 'Maak factuur aan'}</button>
        </div>
      </div>
    </div>
  )
}

// "Print naar PDF"-patroon, consistent met downloadQuotePdf/downloadInvoicePdf elders in de app.
export function downloadHourReportPdf({ client, entries, from, to, companySettings }) {
  const w = window.open('', '_blank')
  if (!w) return
  const totalMinutes = entries.reduce((s, e) => s + (e.minutes || 0), 0)
  const billableMinutes = entries.filter(e => e.is_billable).reduce((s, e) => s + (e.minutes || 0), 0)
  const totalAmount = entries.reduce((s, e) => s + (e.minutes || 0) / 60 * (e.hourly_rate || 0), 0)
  const rows = entries.map(e => `<tr>
    <td>${fdate(e.date)}</td><td>${(e.projects?.name || '')}</td><td>${e.description || ''}</td>
    <td style="text-align:right">${fmtHM(e.minutes)}</td><td style="text-align:right">${e.hourly_rate ? money((e.minutes || 0) / 60 * e.hourly_rate) : '—'}</td>
  </tr>`).join('')
  w.document.write(`<html><head><title>Urenoverzicht</title><style>
    body{font-family:Arial,sans-serif;padding:40px;color:#111}
    h1{font-size:20px;margin-bottom:4px} .sub{color:#666;font-size:13px;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;font-size:13px} th,td{padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:left}
    .totals{margin-top:20px;font-size:14px} .totals div{display:flex;justify-content:space-between;max-width:320px;margin-bottom:4px}
    .totals strong{font-size:16px}
  </style></head><body>
    ${companySettings?.logo_url ? `<img src="${companySettings.logo_url}" style="max-height:40px;margin-bottom:16px" />` : ''}
    <h1>Urenoverzicht — ${fdate(from)} t/m ${fdate(to)}</h1>
    <div class="sub">Klant: ${client ? `${client.fname} ${client.lname}${client.company ? ' — ' + client.company : ''}` : ''}</div>
    <table><thead><tr><th>Datum</th><th>Project</th><th>Omschrijving</th><th style="text-align:right">Duur</th><th style="text-align:right">Bedrag</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="totals">
      <div><span>Totaal uren</span><span>${fmtHM(totalMinutes)}</span></div>
      <div><span>Factureerbare uren</span><span>${fmtHM(billableMinutes)}</span></div>
      <div><strong>Totaalbedrag</strong><strong>${money(totalAmount)}</strong></div>
    </div>
  </body></html>`)
  w.document.close(); w.focus(); w.print()
}
