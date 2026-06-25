import React, { useState } from 'react'
import { motion } from 'framer-motion'
import * as db from '../../lib/db'
import { showToast } from '../Dashboard.jsx'

export default function DuplicateProspectModal({ prospect, stages, onClose, onDone }) {
  const [name, setName] = useState(`${prospect.fname} ${prospect.lname} (kopie)`)
  const [stageId, setStageId] = useState(stages[0]?.id || '')
  const [includeBase, setIncludeBase] = useState(true)
  const [includeValue, setIncludeValue] = useState(true)
  const [includeActivities, setIncludeActivities] = useState(false)
  const [includeTags, setIncludeTags] = useState(false)
  const [saving, setSaving] = useState(false)

  async function duplicate() {
    if (!name.trim()) return showToast('Vul een naam in.', 'error')
    setSaving(true)
    try {
      const copy = await db.duplicateProspect(prospect, { name, stageId, includeBase, includeValue, includeActivities, includeTags })
      showToast('Prospect gedupliceerd')
      onDone(copy)
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-bg open" onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal" style={{ maxWidth: 440 }} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.2 }}>
        <h3>Prospect dupliceren</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>Er wordt een kopie gemaakt van {prospect.fname} {prospect.lname}. Wat wil je meenemen?</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, textTransform: 'none', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeBase} onChange={e => setIncludeBase(e.target.checked)} style={{ width: 15, height: 15 }} /> Basisgegevens (naam, bedrijf, contactinfo, bron)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, textTransform: 'none', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeValue} onChange={e => setIncludeValue(e.target.checked)} style={{ width: 15, height: 15 }} /> Waarde en kans%
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, textTransform: 'none', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeActivities} onChange={e => setIncludeActivities(e.target.checked)} style={{ width: 15, height: 15 }} /> Activiteiten log
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, textTransform: 'none', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeTags} onChange={e => setIncludeTags(e.target.checked)} style={{ width: 15, height: 15 }} /> Tags
          </label>
        </div>
        <div className="form-group">
          <label>Naam voor de kopie</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div className="form-group">
          <label>Fase</label>
          <select value={stageId} onChange={e => setStageId(e.target.value)}>
            {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" onClick={duplicate} disabled={saving}>{saving ? 'Dupliceren…' : 'Dupliceer'}</button>
        </div>
      </motion.div>
    </div>
  )
}
