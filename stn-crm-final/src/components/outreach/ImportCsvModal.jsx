import React, { useState } from 'react'
import * as db from '../../lib/db'
import { showToast } from '../Dashboard.jsx'

const FIELDS = [
  { key: 'name', label: 'Bedrijfsnaam', required: true, synonyms: ['company', 'bedrijf', 'bedrijfsnaam', 'organization', 'naam', 'name'] },
  { key: 'email', label: 'E-mailadres', synonyms: ['email', 'e-mail', 'emailaddress', 'e-mailadres', 'mail'] },
  { key: 'website', label: 'Website', synonyms: ['website', 'site', 'url', 'domain', 'domein'] },
  { key: 'phone', label: 'Telefoon', synonyms: ['phone', 'telefoon', 'telefoonnummer', 'mobile', 'tel'] },
  { key: 'sector', label: 'Sector', synonyms: ['sector', 'branche', 'industry', 'category', 'categorie'] },
]

// Zelfgebouwde CSV-parser (geen nieuwe dependency) — respecteert quotes met
// ingesloten komma's/aanhalingstekens en zowel \n als \r\n regeleindes.
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else inQuotes = false }
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(f => f !== '')) rows.push(row) }
  return rows
}

function guessMapping(headers) {
  const lower = headers.map(h => h.toLowerCase().trim())
  const mapping = {}
  for (const f of FIELDS) {
    const idx = lower.findIndex(h => f.synonyms.some(s => h === s || h.includes(s)))
    mapping[f.key] = idx >= 0 ? idx : ''
  }
  return mapping
}

export default function ImportCsvModal({ organizationId, onClose, onDone }) {
  const [parsed, setParsed] = useState(null) // { headers, data }
  const [mapping, setMapping] = useState({})
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    const reader = new FileReader()
    reader.onload = () => {
      const allRows = parseCsv(String(reader.result || ''))
      if (allRows.length < 2) { setError('Geen (bruikbare) rijen gevonden in dit CSV-bestand.'); return }
      const [headers, ...data] = allRows
      setParsed({ headers, data })
      setMapping(guessMapping(headers))
    }
    reader.readAsText(file)
  }

  async function doImport() {
    if (mapping.name === '' || mapping.name === undefined) { setError('Kies minimaal een kolom voor Bedrijfsnaam.'); return }
    setImporting(true); setError('')
    try {
      const rows = parsed.data.map(cols => ({
        name: mapping.name !== '' ? cols[mapping.name] : '',
        email: mapping.email !== '' ? cols[mapping.email] : '',
        website: mapping.website !== '' ? cols[mapping.website] : '',
        phone: mapping.phone !== '' ? cols[mapping.phone] : '',
        sector: mapping.sector !== '' ? cols[mapping.sector] : '',
      })).filter(r => r.name?.trim())
      const res = await db.outreachImportProspectsCsv(organizationId, rows)
      showToast(`${res.inserted} prospects geïmporteerd${res.duplicates ? ` (${res.duplicates} mogelijke duplicaten gemarkeerd)` : ''}${res.emailsAdded ? `, ${res.emailsAdded} met e-mailadres` : ''}${res.failed ? `, ${res.failed} overgeslagen` : ''}`)
      onDone()
      onClose()
    } catch (e) { setError(e.message) }
    finally { setImporting(false) }
  }

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal" style={{ width: 620 }} onClick={e => e.stopPropagation()}>
        <h3>Prospects importeren uit CSV</h3>
        {!parsed ? (
          <div className="form-group">
            <label>CSV-bestand (bijv. export vanuit Mailmeteor)</label>
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
          </div>
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{parsed.data.length} rijen gevonden. Koppel de kolommen uit je bestand aan de juiste velden:</p>
            {FIELDS.map(f => (
              <div className="form-group" key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <label style={{ minWidth: 120, marginBottom: 0 }}>{f.label}{f.required && ' *'}</label>
                <select style={{ flex: 1 }} value={mapping[f.key]} onChange={e => setMapping({ ...mapping, [f.key]: e.target.value === '' ? '' : Number(e.target.value) })}>
                  <option value="">— niet gebruiken —</option>
                  {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `(kolom ${i + 1})`}</option>)}
                </select>
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
              Voorbeeld eerste rij: {parsed.data[0]?.join(' · ')}
            </div>
          </>
        )}
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 10 }}>{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          {parsed && <button type="button" className="btn btn-primary" disabled={importing} onClick={doImport}>{importing ? 'Importeren…' : `Importeer ${parsed.data.length} prospects`}</button>}
        </div>
      </div>
    </div>
  )
}
