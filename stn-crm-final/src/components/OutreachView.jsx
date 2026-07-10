import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as db from '../lib/db'
import { showToast } from './Dashboard.jsx'
import ScoutingTab from './outreach/ScoutingTab.jsx'
import ProspectsTab from './outreach/ProspectsTab.jsx'
import EmailsTab from './outreach/EmailsTab.jsx'
import TemplatesTab from './outreach/TemplatesTab.jsx'
import FlowsTab from './outreach/FlowsTab.jsx'
import InsightsTab from './outreach/InsightsTab.jsx'

const TABS = [
  ['scouting', 'Scouten'],
  ['prospects', 'Prospects'],
  ['emails', 'E-mails'],
  ['templates', 'Sjablonen'],
  ['flows', 'Flows'],
  ['insights', 'Insights'],
]

export default function OutreachView({ organizationId }) {
  const [tab, setTab] = useState('scouting')
  const [prospects, setProspects] = useState([])
  const [emails, setEmails] = useState([])
  const [templates, setTemplates] = useState([])
  const [flows, setFlows] = useState([])
  const [loading, setLoading] = useState(true)
  // Blijft zichtbaar over sub-tab-wissels heen (niet over een paginaverversing —
  // dat vereist server-side scheduling met seconde-precisie, buiten scope voor nu).
  const [pendingSend, setPendingSend] = useState(null) // { send, secondsLeft }
  const timerRef = useRef(null)

  const refreshAll = useCallback(async () => {
    if (!organizationId) return
    try {
      const [p, e, t, fl] = await Promise.all([
        db.outreachGetProspects(organizationId), db.outreachGetEmails(organizationId),
        db.outreachGetTemplates(organizationId), db.outreachGetFlows(organizationId),
      ])
      setProspects(p.prospects); setEmails(e.emails); setTemplates(t.templates); setFlows(fl.flows)
    } catch (e) { showToast('Fout bij laden: ' + e.message, 'error') }
    finally { setLoading(false) }
  }, [organizationId])

  useEffect(() => { refreshAll() }, [refreshAll])
  useEffect(() => () => clearInterval(timerRef.current), [])

  async function startSend(prospectId, emailId) {
    try {
      const { send, undoWindowSeconds } = await db.outreachScheduleSend(organizationId, prospectId, emailId)
      setPendingSend({ send, secondsLeft: undoWindowSeconds })
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setPendingSend(prev => {
          if (!prev) return prev
          if (prev.secondsLeft <= 1) {
            clearInterval(timerRef.current)
            confirmPendingSend(prev.send.id)
            return null
          }
          return { ...prev, secondsLeft: prev.secondsLeft - 1 }
        })
      }, 1000)
    } catch (e) { showToast(e.message, 'error') }
  }

  async function confirmPendingSend(sendId) {
    try {
      await db.outreachConfirmSend(organizationId, sendId)
      showToast('Mail verstuurd')
    } catch (e) { showToast('Versturen mislukt: ' + e.message, 'error') }
    finally { refreshAll() }
  }

  async function cancelPendingSend() {
    if (!pendingSend) return
    clearInterval(timerRef.current)
    try { await db.outreachCancelSend(organizationId, pendingSend.send.id); showToast('Verzending geannuleerd') }
    catch (e) { showToast(e.message, 'error') }
    finally { setPendingSend(null); refreshAll() }
  }

  async function startFlow(prospectId, emailId, flowId) {
    try {
      await db.outreachStartFlow(organizationId, prospectId, emailId, flowId)
      showToast('Flow gestart — stap 1 staat klaar bij Taken om goed te keuren')
      refreshAll()
    } catch (e) { showToast(e.message, 'error') }
  }

  const emailsByProspect = {}
  emails.forEach(e => { (emailsByProspect[e.prospect_id] ||= []).push(e) })
  const prospectById = Object.fromEntries(prospects.map(p => [p.id, p]))

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontFamily: 'var(--heading-font)', fontSize: 16, fontWeight: 700 }}>Outreach</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Leadgeneratie via e-mail — van zoeken tot opvolgen.</p>
        </div>
      </div>

      <AnimatePresence>
        {pendingSend && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <motion.span animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1.2, repeat: Infinity }}
                style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 13 }}>Mail wordt over <strong>{pendingSend.secondsLeft}s</strong> verstuurd — <strong>{pendingSend.send.subject}</strong></span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={cancelPendingSend}>Annuleren</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {loading ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Laden…</div> : (
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
            {tab === 'scouting' && (
              <ScoutingTab organizationId={organizationId} prospects={prospects} onRefresh={refreshAll} />
            )}
            {tab === 'prospects' && (
              <ProspectsTab organizationId={organizationId} prospects={prospects} emailsByProspect={emailsByProspect} flows={flows} onRefresh={refreshAll} />
            )}
            {tab === 'emails' && (
              <EmailsTab organizationId={organizationId} emails={emails} prospectById={prospectById} flows={flows} pendingSendId={pendingSend?.send.id} onSchedule={startSend} onStartFlow={startFlow} onRefresh={refreshAll} />
            )}
            {tab === 'templates' && (
              <TemplatesTab organizationId={organizationId} templates={templates} onRefresh={refreshAll} />
            )}
            {tab === 'flows' && (
              <FlowsTab organizationId={organizationId} flows={flows} templates={templates} onRefresh={refreshAll} />
            )}
            {tab === 'insights' && (
              <InsightsTab organizationId={organizationId} />
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
