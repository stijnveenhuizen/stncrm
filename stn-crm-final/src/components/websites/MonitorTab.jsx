import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import * as db from '../../lib/db'
import { fdate, daysN, showToast } from '../Dashboard.jsx'

function speedColor(score) {
  if (score == null) return 'var(--text-muted-tok)'
  if (score >= 90) return 'var(--success)'
  if (score >= 50) return 'var(--warning)'
  return 'var(--danger)'
}

function CountUp({ value }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (value == null) return
    const start = Date.now()
    const duration = 600
    let raf
    function tick() {
      const t = Math.min(1, (Date.now() - start) / duration)
      setDisplay(Math.round(t * value))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    tick()
    return () => raf && cancelAnimationFrame(raf)
  }, [value])
  return <>{value == null ? '—' : display}</>
}

export default function MonitorTab({ allHosting, projects = [], onRefresh, activeOrgId }) {
  const [latestChecks, setLatestChecks] = useState({})
  const [checkingAll, setCheckingAll] = useState(false)
  const [checkingSite, setCheckingSite] = useState(null)
  const [detailSite, setDetailSite] = useState(null)

  const sites = allHosting.filter(h => h.monitor_enabled !== false && h.url)

  const refresh = () => { if (activeOrgId) db.getLatestChecks(activeOrgId).then(setLatestChecks).catch(() => {}) }
  useEffect(() => { refresh() }, [activeOrgId, allHosting])

  async function checkSite(site) {
    setCheckingSite(site.id)
    try {
      await db.triggerUptimeCheck(site.id)
      const speedResult = await db.triggerPagespeedCheck(site.id)
      refresh()
      if (speedResult?.warning) showToast(speedResult.warning, 'error')
      else showToast(`${site.site_name} gecheckt`)
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setCheckingSite(null) }
  }

  async function checkAll() {
    setCheckingAll(true)
    try { await db.checkAllSites(activeOrgId); refresh(); showToast('Alle sites gecheckt') }
    catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setCheckingAll(false) }
  }

  const onlineCount = sites.filter(s => latestChecks[s.id]?.is_online).length
  const speeds = sites.map(s => latestChecks[s.id]?.pagespeed_mobile).filter(v => v != null)
  const avgSpeed = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null
  const sslProblems = sites.filter(s => {
    const c = latestChecks[s.id]
    if (!c) return false
    if (c.ssl_valid === false) return true
    if (c.ssl_expires_at && daysN(c.ssl_expires_at) <= 14) return true
    return false
  }).length
  const lastCheckTime = Object.values(latestChecks).map(c => c.checked_at).sort().slice(-1)[0]

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h3 style={{ fontFamily: 'var(--heading-font)', fontSize: 16, fontWeight: 700 }}>Website Monitor</h3>
        <button className="btn btn-primary btn-sm" onClick={checkAll} disabled={checkingAll}>{checkingAll ? 'Checken…' : 'Alles checken'}</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card"><div className="stat-label">Sites online</div><div className="stat-value"><CountUp value={onlineCount} />/{sites.length}</div></div>
        <div className="stat-card"><div className="stat-label">Gem. PageSpeed</div><div className="stat-value" style={{ color: speedColor(avgSpeed) }}><CountUp value={avgSpeed} /></div></div>
        <div className="stat-card"><div className="stat-label">SSL problemen</div><div className="stat-value" style={{ color: sslProblems > 0 ? 'var(--danger)' : 'var(--text-primary)' }}><CountUp value={sslProblems} /></div></div>
        <div className="stat-card"><div className="stat-label">Laatste check</div><div className="stat-value" style={{ fontSize: 16 }}>{lastCheckTime ? new Date(lastCheckTime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '—'}</div></div>
      </div>

      {!sites.length ? (
        <div className="empty">Geen sites met een URL om te monitoren. Voeg een URL toe bij een site in de Sites-tab.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
          {sites.map((site, i) => (
            <SiteCard key={site.id} site={site} check={latestChecks[site.id]} index={i}
              onCheck={() => checkSite(site)} checking={checkingSite === site.id} onClick={() => setDetailSite(site)} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {detailSite && <SiteDetailPanel site={detailSite} projects={projects} onClose={() => setDetailSite(null)} />}
      </AnimatePresence>
    </div>
  )
}

function SiteCard({ site, check, index, onCheck, checking, onClick }) {
  const status = !check ? 'unknown' : check.is_online ? 'online' : 'offline'
  const sslDays = check?.ssl_expires_at ? daysN(check.ssl_expires_at) : null
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06, duration: 0.3 }}
      className="sc" style={{ padding: 16, cursor: 'pointer' }} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusDot status={status} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{site.domain || site.site_name}</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted-tok)' }}>{site.clients ? `${site.clients.fname} ${site.clients.lname}` : ''}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted-tok)', textTransform: 'uppercase', marginBottom: 2 }}>Uptime</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{check ? (check.is_online ? '99.9%' : '0%') : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted-tok)' }}>{check?.response_time_ms != null ? `${check.response_time_ms}ms` : ''}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted-tok)', textTransform: 'uppercase', marginBottom: 2 }}>PageSpeed</div>
          <div style={{ fontSize: 12, color: speedColor(check?.pagespeed_mobile) }}>Mobile: <strong>{check?.pagespeed_mobile ?? '—'}</strong></div>
          <div style={{ fontSize: 12, color: speedColor(check?.pagespeed_desktop) }}>Desktop: <strong>{check?.pagespeed_desktop ?? '—'}</strong></div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted-tok)', textTransform: 'uppercase', marginBottom: 2 }}>SSL</div>
          {check?.ssl_valid ? <div style={{ fontSize: 12, color: sslDays != null && sslDays <= 14 ? 'var(--danger)' : 'var(--success)' }}>✅ {sslDays != null ? `${sslDays} dagen` : 'geldig'}</div> : <div style={{ fontSize: 12, color: 'var(--text-muted-tok)' }}>—</div>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-default)', paddingTop: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted-tok)' }}>{check?.wp_version ? `WordPress ${check.wp_version}` : ''}{check?.php_version ? ` · PHP ${check.php_version}` : ''}</span>
        <button className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); onCheck() }} disabled={checking}>{checking ? '…' : 'Nu checken'}</button>
      </div>
    </motion.div>
  )
}

function StatusDot({ status }) {
  if (status === 'online') {
    return (
      <span style={{ position: 'relative', width: 9, height: 9, display: 'inline-block' }}>
        <motion.span animate={{ scale: [1, 1.4, 1], opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }}
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--success)' }} />
      </span>
    )
  }
  if (status === 'offline') {
    return <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.8, repeat: Infinity }}
      style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--danger)', display: 'inline-block' }} />
  }
  return <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--text-muted-tok)', display: 'inline-block' }} />
}

// Splitst de genummerde AI-tekst ("1. ... 2. ...") in losse punten zodat elk
// punt los als taak toegevoegd kan worden. Valt terug op de hele tekst als 1
// item wanneer het model toch geen nette lijst teruggeeft.
function parseAdviceItems(text) {
  if (!text) return []
  const parts = text.split(/\n?(?=\d+\.\s)/).map(s => s.trim()).filter(Boolean).filter(s => /^\d+\.\s/.test(s)).map(s => s.replace(/^\d+\.\s*/, ''))
  return parts.length ? parts : [text.trim()]
}

function SiteDetailPanel({ site, projects = [], onClose }) {
  const [tab, setTab] = useState('overzicht')
  const [history, setHistory] = useState([])
  const [plugins, setPlugins] = useState([])
  const [advice, setAdvice] = useState(site.ai_advice || '')
  const [adviceLoading, setAdviceLoading] = useState(false)
  const [addedItems, setAddedItems] = useState([])
  const siteProjects = projects.filter(p => p.client_id === site.client_id)
  const [taskProjectId, setTaskProjectId] = useState(siteProjects[0]?.id || '')

  useEffect(() => {
    db.getWebsiteChecks(site.id, 30).then(setHistory).catch(() => {})
    db.getWebsitePlugins(site.id).then(setPlugins).catch(() => {})
  }, [site.id])

  async function generateAdvice() {
    setAdviceLoading(true)
    try {
      const { result } = await db.getWebsiteAiAdvice(site.id)
      setAdvice(result)
      setAddedItems([])
    } catch (e) { showToast(e.message, 'error') }
    finally { setAdviceLoading(false) }
  }

  async function addAdviceAsTask(text, index) {
    if (!taskProjectId) return showToast('Kies eerst een project om de taak aan toe te voegen.', 'error')
    try {
      await db.createTask({ project_id: taskProjectId, description: text, due_date: null, priority: 'normaal', assigned_to: null, done: false, visible_to_client: false, created_by: 'staff' })
      setAddedItems(items => [...items, index])
      showToast('Taak toegevoegd')
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
  }

  const adviceItems = useMemo(() => parseAdviceItems(advice), [advice])

  const chartData = useMemo(() => [...history].reverse().map(h => ({
    date: fdate(h.checked_at?.slice(0, 10)), uptime: h.is_online ? 100 : 0, mobile: h.pagespeed_mobile, desktop: h.pagespeed_desktop,
  })), [history])

  function copyPluginReport() {
    const text = plugins.map(p => `${p.name} — v${p.version || '?'}${p.has_update ? ' (update beschikbaar)' : ''}`).join('\n')
    navigator.clipboard?.writeText(text)
    showToast('Plugin-rapport gekopieerd')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end' }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} onClick={onClose} />
      <motion.div initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '100%', opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{ position: 'relative', width: 580, maxWidth: '100vw', height: '100%', background: 'var(--bg-base)', boxShadow: '-8px 0 30px rgba(0,0,0,.15)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--heading-font)' }}>{site.site_name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{site.domain}</div>
          </div>
          <button onClick={onClose} aria-label="Sluiten" style={{ fontSize: 20, color: 'var(--text-faint)', cursor: 'pointer' }}>×</button>
        </div>
        <div className="tabs" style={{ margin: '14px 24px 0' }}>
          {[['overzicht', 'Overzicht'], ['geschiedenis', 'Geschiedenis'], ['plugins', 'Plugins']].map(([t, label]) => (
            <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {tab === 'overzicht' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase' }}>✨ AI-prestatieadvies</span>
                <button className="btn btn-ghost btn-xs" onClick={generateAdvice} disabled={adviceLoading}>{advice ? 'Vernieuwen' : 'Genereren'}</button>
              </div>
              {adviceLoading ? (
                <div style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', padding: 12, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                  Analyseren…
                </div>
              ) : advice ? (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                  style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 20 }}>
                  {siteProjects.length > 1 && (
                    <div style={{ marginBottom: 10 }}>
                      <select value={taskProjectId} onChange={e => setTaskProjectId(e.target.value)} style={{ width: 'auto', fontSize: 12 }}>
                        {siteProjects.map(p => <option key={p.id} value={p.id}>Taken toevoegen aan: {p.name}</option>)}
                      </select>
                    </div>
                  )}
                  {adviceItems.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, marginBottom: 8, paddingBottom: 8, borderBottom: i < adviceItems.length - 1 ? '1px solid var(--accent-border)' : 'none' }}>
                      <span style={{ flex: 1 }}>{item}</span>
                      {siteProjects.length > 0 ? (
                        <button className="btn btn-ghost btn-xs" style={{ flexShrink: 0 }} disabled={addedItems.includes(i)} onClick={() => addAdviceAsTask(item, i)}>
                          {addedItems.includes(i) ? '✓ Taak' : '+ Taak'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>geen project</span>
                      )}
                    </div>
                  ))}
                </motion.div>
              ) : <div style={{ fontSize: 12, color: 'var(--text-muted-tok)', marginBottom: 20 }}>Nog geen AI-advies gegenereerd. Zorg dat er eerst een PageSpeed-check is uitgevoerd.</div>}

              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted-tok)', textTransform: 'uppercase', marginBottom: 8 }}>Uptime (laatste 30 checks)</div>
              <div style={{ height: 140, marginBottom: 24 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 12 }} />
                    <Line type="step" dataKey="uptime" stroke="var(--success)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted-tok)', textTransform: 'uppercase', marginBottom: 8 }}>PageSpeed trend</div>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="var(--border-default)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted-tok)' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: 12 }} />
                    <Line type="monotone" dataKey="mobile" name="Mobile" stroke="var(--accent)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="desktop" name="Desktop" stroke="var(--info)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {tab === 'geschiedenis' && (
            <div className="sc" style={{ padding: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 1fr', padding: '8px 12px', background: 'var(--bg-subtle)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted-tok)', textTransform: 'uppercase' }}>
                <div>Gecheckt</div><div>Status</div><div>Respons</div><div>Mobile</div><div>SSL</div>
              </div>
              {!history.length ? <div className="empty">Nog geen checks uitgevoerd</div> : history.map(h => (
                <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 1fr', padding: '8px 12px', borderTop: '1px solid var(--border-default)', fontSize: 12 }}>
                  <div>{new Date(h.checked_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  <div style={{ color: h.is_online ? 'var(--success)' : 'var(--danger)' }}>{h.is_online ? 'Online' : 'Offline'}</div>
                  <div>{h.response_time_ms != null ? `${h.response_time_ms}ms` : '—'}</div>
                  <div style={{ color: speedColor(h.pagespeed_mobile) }}>{h.pagespeed_mobile ?? '—'}</div>
                  <div>{h.ssl_valid == null ? '—' : h.ssl_valid ? '✅' : '❌'}</div>
                </div>
              ))}
            </div>
          )}
          {tab === 'plugins' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <button className="btn btn-ghost btn-sm" onClick={copyPluginReport} disabled={!plugins.length}>Plugin rapport kopiëren</button>
              </div>
              {!plugins.length ? <div className="empty">Nog geen plugins gedetecteerd (alleen mogelijk bij WordPress-sites die online zijn).</div> : plugins.map(p => (
                <div key={p.id} className="info-row" style={{ alignItems: 'center' }}>
                  <span className="info-val" style={{ flex: 1 }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted-tok)', marginRight: 8 }}>v{p.version || '?'}</span>
                  {p.has_update && <span className="badge bg-amber">Update beschikbaar ⚠️</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
