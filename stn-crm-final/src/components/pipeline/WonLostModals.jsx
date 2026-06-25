import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import * as db from '../../lib/db'
import { money, showToast } from '../Dashboard.jsx'
import { LOST_REASONS } from '../PipelineView.jsx'

function fireConfetti() {
  const end = Date.now() + 2000
  const colors = ['#3db68e', '#a7e8d3', '#ffffff']
  ;(function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors })
    confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors })
    if (Date.now() < end) requestAnimationFrame(frame)
  })()
}

export default function WonLostModals({ pendingMove, organizationId, onClose, onDone }) {
  const { prospect, stage, mode } = pendingMove
  const [createClient, setCreateClient] = useState(true)
  const [createProject, setCreateProject] = useState(false)
  const [projectName, setProjectName] = useState(`Website ${prospect.company || prospect.fname}`)
  const [lostReason, setLostReason] = useState('')
  const [lostReasonPreset, setLostReasonPreset] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (mode === 'won') fireConfetti() }, [mode])

  async function confirmWon() {
    setSaving(true)
    try {
      let client = null
      if (createClient) {
        client = await db.convertToClient(prospect)
        if (createProject && projectName.trim()) {
          await db.createProject({ organization_id: organizationId, client_id: client.id, name: projectName.trim(), status: 'actief', color: '#3db68e' })
        }
      }
      await db.moveProspectToStage(prospect, stage)
      showToast('Deal gewonnen!')
      onDone()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  async function confirmLost() {
    const reason = (lostReasonPreset === 'Anders' ? lostReason : lostReasonPreset) || lostReason
    if (!reason.trim()) return showToast('Vul een reden in.', 'error')
    setSaving(true)
    try {
      await db.moveProspectToStage(prospect, stage, { lost_reason: reason.trim() })
      showToast('Deal afgewezen')
      onDone()
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal" style={{ maxWidth: 440 }} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }}>
        {mode === 'won' ? (
          <>
            <h3>🎉 Deal gewonnen!</h3>
            <p style={{ fontSize: 14, marginBottom: 16 }}>{money(prospect.deal_value || 0)} — {prospect.fname} {prospect.lname}{prospect.company ? ' · ' + prospect.company : ''}</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, textTransform: 'none', marginBottom: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={createClient} onChange={e => setCreateClient(e.target.checked)} style={{ width: 15, height: 15 }} />
              Klant aanmaken van deze prospect
            </label>
            {createClient && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, textTransform: 'none', marginBottom: 10, cursor: 'pointer', marginLeft: 22 }}>
                <input type="checkbox" checked={createProject} onChange={e => setCreateProject(e.target.checked)} style={{ width: 15, height: 15 }} />
                Direct een project aanmaken
              </label>
            )}
            {createClient && createProject && (
              <div className="form-group" style={{ marginLeft: 22, marginBottom: 4 }}>
                <label>Projectnaam</label>
                <input value={projectName} onChange={e => setProjectName(e.target.value)} />
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
              <button className="btn btn-primary" onClick={confirmWon} disabled={saving}>{saving ? 'Bezig…' : 'Bevestigen'}</button>
            </div>
          </>
        ) : (
          <>
            <h3>Deal afgewezen</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>{prospect.fname} {prospect.lname}{prospect.company ? ' · ' + prospect.company : ''}</p>
            <div className="form-group">
              <label>Wat was de reden?</label>
              <select value={lostReasonPreset} onChange={e => setLostReasonPreset(e.target.value)} style={{ marginBottom: 8 }}>
                <option value="">— Kies een veelgebruikte reden —</option>
                {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {(lostReasonPreset === 'Anders' || !lostReasonPreset) && <input value={lostReason} onChange={e => setLostReason(e.target.value)} placeholder="Of typ een eigen reden…" autoFocus />}
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
              <button className="btn btn-danger" onClick={confirmLost} disabled={saving}>{saving ? 'Bezig…' : 'Bevestigen'}</button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
