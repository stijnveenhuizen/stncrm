import React, { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import * as db from '../lib/db'
import { showToast } from './Dashboard.jsx'
import ScoutingTab from './outreach/ScoutingTab.jsx'
import ProspectsTab from './outreach/ProspectsTab.jsx'
import FlowsTab from './outreach/FlowsTab.jsx'
import InsightsTab from './outreach/InsightsTab.jsx'

const TABS = [
  ['scouting', 'Scouten'],
  ['prospects', 'Prospects'],
  ['flows', 'Flows'],
  ['insights', 'Insights'],
]

export default function OutreachView({ organizationId }) {
  const [tab, setTab] = useState('scouting')
  const [prospects, setProspects] = useState([])
  const [emails, setEmails] = useState([])
  const [flows, setFlows] = useState([])
  const [loading, setLoading] = useState(true)

  const refreshAll = useCallback(async () => {
    if (!organizationId) return
    try {
      const [p, e, fl] = await Promise.all([
        db.outreachGetProspects(organizationId), db.outreachGetEmails(organizationId), db.outreachGetFlows(organizationId),
      ])
      setProspects(p.prospects); setEmails(e.emails); setFlows(fl.flows)
    } catch (e) { showToast('Fout bij laden: ' + e.message, 'error') }
    finally { setLoading(false) }
  }, [organizationId])

  useEffect(() => { refreshAll() }, [refreshAll])

  const emailsByProspect = {}
  emails.forEach(e => { (emailsByProspect[e.prospect_id] ||= []).push(e) })

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontFamily: 'var(--heading-font)', fontSize: 16, fontWeight: 700 }}>Outreach</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Leadgeneratie via e-mail — van scouten tot opvolgen.</p>
        </div>
      </div>

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
            {tab === 'flows' && (
              <FlowsTab organizationId={organizationId} flows={flows} onRefresh={refreshAll} />
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
