import React, { useState, useEffect, useRef } from 'react'
import * as db from '../lib/db'
import { showToast } from './Dashboard.jsx'

export const ONBOARDING_STEPS = ['welcome', 'company_setup', 'first_client', 'first_project', 'demo_tour', 'completed']
const STEP_LABELS = {
  welcome: 'Welkom',
  company_setup: 'Jouw bedrijf',
  first_client: 'Eerste klant',
  first_project: 'Eerste project',
  demo_tour: 'Rondleiding',
  completed: 'Klaar',
}

const CSS = `
  .ob-overlay{position:fixed;inset:0;background:var(--bg);z-index:1000;display:flex;flex-direction:column;overflow-y:auto}
  .ob-head{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;flex-shrink:0}
  .ob-progress-wrap{flex:1;max-width:420px;margin:0 24px}
  .ob-progress-bar{height:5px;background:var(--bg2);border-radius:99px;overflow:hidden}
  .ob-progress-fill{height:100%;background:var(--accent);border-radius:99px;transition:width .3s}
  .ob-progress-label{font-size:11px;color:var(--text-faint);margin-top:5px}
  .ob-skip{font-size:12px;color:var(--text-faint);cursor:pointer;background:none;border:none;flex-shrink:0}
  .ob-skip:hover{color:var(--text-muted)}
  .ob-body{flex:1;display:flex;align-items:center;justify-content:center;padding:24px}
  .ob-card{width:100%;max-width:480px}
  .ob-footer{display:flex;justify-content:space-between;padding:18px 24px;flex-shrink:0}
  .ob-icon-row{display:flex;gap:18px;justify-content:center;margin:28px 0}
  .ob-icon-item{flex:1;text-align:center;font-size:12px;color:var(--text-muted)}
  .ob-icon-circle{width:48px;height:48px;border-radius:50%;background:var(--accent-soft);color:var(--accent-text);display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:20px}
  .ob-check{display:flex;align-items:center;gap:8px;background:var(--green-soft);color:var(--green-text);padding:10px 14px;border-radius:var(--rsm);font-size:13px;font-weight:500;margin-top:12px}
  .ob-dropzone{border:2px dashed var(--border-strong);border-radius:var(--r);padding:20px;text-align:center;cursor:pointer;transition:border-color .15s}
  .ob-dropzone:hover,.ob-dropzone.drag{border-color:var(--accent)}
`

function ProgressHeader({ stepIndex, onSkipAll }) {
  const name = STEP_LABELS[ONBOARDING_STEPS[stepIndex]]
  return (
    <div className="ob-head">
      <div style={{width:24}} />
      <div className="ob-progress-wrap">
        <div className="ob-progress-bar"><div className="ob-progress-fill" style={{width: ((stepIndex+1)/6*100)+'%'}}></div></div>
        <div className="ob-progress-label">Stap {stepIndex+1} van 6 · {name}</div>
      </div>
      <button className="ob-skip" onClick={onSkipAll}>Overslaan</button>
    </div>
  )
}

export default function OnboardingWizard({ stepIndex, organizationId, orgName, profile, onStepIndexChange, onExit }) {
  const [firstClient, setFirstClient] = useState(null)
  const [firstProject, setFirstProject] = useState(null)
  const viewedRef = useRef(null)

  const step = ONBOARDING_STEPS[stepIndex]

  useEffect(() => {
    if (stepIndex === 4) return // de rondleiding wordt door Dashboard zelf getoond
    if (viewedRef.current === step) return
    viewedRef.current = step
    db.trackOnboardingEvent(organizationId, step, 'viewed').catch(() => {})
  }, [step, stepIndex, organizationId])

  async function goNext(completedThisStep = true) {
    if (completedThisStep) {
      try { await db.trackOnboardingEvent(organizationId, step, 'completed') } catch (e) {}
    }
    onStepIndexChange(Math.min(stepIndex + 1, 5))
  }
  async function skipStepOnly() {
    try { await db.trackOnboardingEvent(organizationId, step, 'skipped') } catch (e) {}
    onStepIndexChange(Math.min(stepIndex + 1, 5))
  }
  async function skipAll() {
    try {
      await db.createDemoData(organizationId)
      await db.trackOnboardingEvent(organizationId, step, 'skipped')
      await db.skipOnboarding(organizationId)
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    onExit()
  }
  function goBack() { onStepIndexChange(Math.max(stepIndex - 1, 0)) }

  if (stepIndex === 4) return null // tour wordt elders getoond (echte sidebar)

  return (
    <div className="ob-overlay">
      <style>{CSS}</style>
      <ProgressHeader stepIndex={stepIndex} onSkipAll={skipAll} />
      <div className="ob-body">
        <div className="ob-card">
          {step === 'welcome' && <WelcomeStep orgName={orgName} onStart={() => goNext()} onLookAround={skipAll} />}
          {step === 'company_setup' && <CompanyStep organizationId={organizationId} orgName={orgName} profile={profile} onNext={() => goNext()} />}
          {step === 'first_client' && <FirstClientStep organizationId={organizationId} onCreated={setFirstClient} onNext={() => goNext()} onSkip={skipStepOnly} />}
          {step === 'first_project' && <FirstProjectStep organizationId={organizationId} firstClient={firstClient} onCreated={setFirstProject} onNext={() => goNext()} onSkip={skipStepOnly} />}
          {step === 'completed' && <CompletedStep organizationId={organizationId} firstClient={firstClient} firstProject={firstProject} onExit={onExit} />}
        </div>
      </div>
      {!['welcome','completed'].includes(step) && (
        <div className="ob-footer">
          <button className="btn btn-ghost btn-sm" onClick={goBack}>← Terug</button>
          <div />
        </div>
      )}
    </div>
  )
}

function WelcomeStep({ orgName, onStart, onLookAround }) {
  return (
    <div style={{textAlign:'center'}}>
      <h1 style={{fontFamily:'var(--heading-font)',fontSize:26,fontWeight:700,marginBottom:10}}>Welkom bij STN CRM{orgName ? ', ' + orgName : ''}</h1>
      <p style={{fontSize:14,color:'var(--text-muted)',lineHeight:1.6}}>Jouw CRM speciaal voor webdesigners. We helpen je in 5 minuten op weg.</p>
      <div className="ob-icon-row">
        <div className="ob-icon-item"><div className="ob-icon-circle">◐</div>Klanten beheren</div>
        <div className="ob-icon-item"><div className="ob-icon-circle">▣</div>Projecten bijhouden</div>
        <div className="ob-icon-item"><div className="ob-icon-circle">€</div>Facturen versturen</div>
      </div>
      <button className="btn btn-primary" style={{width:'100%',padding:'12px',fontSize:15}} onClick={onStart}>Aan de slag</button>
      <div style={{marginTop:14}}><span onClick={onLookAround} style={{fontSize:12,color:'var(--text-faint)',cursor:'pointer',textDecoration:'underline'}}>Ik wil eerst rondkijken</span></div>
    </div>
  )
}

function CompanyStep({ organizationId, orgName, profile, onNext }) {
  const [form, setForm] = useState({
    name: orgName || '', fullName: profile?.full_name || '', vat: '', coc: '', street: '', zip: '', city: '',
  })
  const [logoFile, setLogoFile] = useState(null)
  const [drag, setDrag] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  function handleDrop(e) {
    e.preventDefault(); setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) setLogoFile(file)
  }

  async function save() {
    if (!form.name.trim()) return showToast('Vul een bedrijfsnaam in.', 'error')
    setSaving(true)
    try {
      await db.updateOrganization(organizationId, { name: form.name.trim() })
      if (form.fullName.trim() && profile?.id) await db.upsertProfile(profile.id, { full_name: form.fullName.trim() }).catch(() => {})
      const address = [form.street, [form.zip, form.city].filter(Boolean).join(' ')].filter(Boolean).join('\n')
      const settingsUpdate = { vat_number: form.vat || null, coc_number: form.coc || null, invoice_address: address || null }
      if (logoFile) settingsUpdate.logo_url = await db.uploadCompanyLogo(organizationId, logoFile)
      await db.upsertCompanySettings(organizationId, settingsUpdate)
      onNext()
    } catch (e) { showToast('Fout bij opslaan: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <h2 style={{fontFamily:'var(--heading-font)',fontSize:19,fontWeight:700,marginBottom:6}}>Jouw bedrijf</h2>
      <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:18}}>Vertel ons iets over je bedrijf, zodat we het meteen goed kunnen instellen.</p>
      <div className="form-group"><label>Bedrijfsnaam</label><input value={form.name} onChange={f('name')} autoFocus /></div>
      <div className="form-group"><label>Jouw volledige naam</label><input value={form.fullName} onChange={f('fullName')} /></div>
      <div className="form-group">
        <label>Logo (optioneel)</label>
        <div className="ob-dropzone" style={drag ? {borderColor:'var(--accent)'} : {}} onClick={() => fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={handleDrop}>
          {logoFile ? logoFile.name : 'Klik of sleep een PNG/JPG/SVG hierheen (max 2MB)'}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e => setLogoFile(e.target.files[0] || null)} />
      </div>
      <div className="form-row">
        <div className="form-group"><label>BTW-nummer (optioneel)</label><input value={form.vat} onChange={f('vat')} /></div>
        <div className="form-group"><label>KVK-nummer (optioneel)</label><input value={form.coc} onChange={f('coc')} /></div>
      </div>
      <div className="form-group"><label>Straat + huisnummer</label><input value={form.street} onChange={f('street')} /></div>
      <div className="form-row">
        <div className="form-group"><label>Postcode</label><input value={form.zip} onChange={f('zip')} /></div>
        <div className="form-group"><label>Stad</label><input value={form.city} onChange={f('city')} /></div>
      </div>
      <div style={{fontSize:11,color:'var(--text-faint)',marginBottom:14}}>Je kunt dit later altijd aanpassen via Bedrijfsinstellingen.</div>
      <button className="btn btn-primary" style={{width:'100%',padding:'11px'}} onClick={save} disabled={saving}>{saving ? 'Opslaan…' : 'Volgende'}</button>
    </div>
  )
}

function FirstClientStep({ organizationId, onCreated, onNext, onSkip }) {
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  async function create() {
    if (!form.name.trim()) return showToast('Vul een naam in.', 'error')
    setSaving(true)
    try {
      const [fname, ...rest] = form.name.trim().split(' ')
      const client = await db.createClient({ organization_id: organizationId, fname, lname: rest.join(' ') || '—', company: form.company || null, email: form.email || null, phone: form.phone || null, status: 'actief' })
      onCreated(client); setDone(true)
    } catch (e) { showToast('Fout bij opslaan: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <h2 style={{fontFamily:'var(--heading-font)',fontSize:19,fontWeight:700,marginBottom:6}}>Eerste klant toevoegen</h2>
      <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:18}}>Voeg je eerste klant toe. Dit is een bedrijf of persoon waarvoor je werkt.</p>
      <div className="form-group"><label>Naam contactpersoon</label><input value={form.name} onChange={f('name')} autoFocus disabled={done} /></div>
      <div className="form-group"><label>Bedrijfsnaam</label><input value={form.company} onChange={f('company')} disabled={done} /></div>
      <div className="form-row">
        <div className="form-group"><label>E-mailadres</label><input type="email" value={form.email} onChange={f('email')} disabled={done} /></div>
        <div className="form-group"><label>Telefoonnummer</label><input value={form.phone} onChange={f('phone')} disabled={done} /></div>
      </div>
      {done && <div className="ob-check">✓ Klant toegevoegd!</div>}
      <div style={{marginTop:16}}>
        {!done
          ? <button className="btn btn-primary" style={{width:'100%',padding:'11px'}} onClick={create} disabled={saving}>{saving ? 'Opslaan…' : 'Klant toevoegen'}</button>
          : <button className="btn btn-primary" style={{width:'100%',padding:'11px'}} onClick={onNext}>Volgende</button>}
      </div>
      {!done && <div style={{textAlign:'center',marginTop:12}}><span onClick={onSkip} style={{fontSize:12,color:'var(--text-faint)',cursor:'pointer',textDecoration:'underline'}}>Heb je nu geen klant bij de hand? Overslaan voor nu</span></div>}
    </div>
  )
}

const PROJECT_TYPES = ['WordPress', 'Webflow', 'Custom', 'Anders']

function FirstProjectStep({ organizationId, firstClient, onCreated, onNext, onSkip }) {
  const [form, setForm] = useState({ name: '', clientName: '', type: 'WordPress', deadline: '', url: '' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  async function create() {
    if (!form.name.trim()) return showToast('Vul een projectnaam in.', 'error')
    setSaving(true)
    try {
      let clientId = firstClient?.id || null
      if (!clientId && form.clientName.trim()) {
        const [fname, ...rest] = form.clientName.trim().split(' ')
        const client = await db.createClient({ organization_id: organizationId, fname, lname: rest.join(' ') || '—', status: 'actief' })
        clientId = client.id
      }
      const project = await db.createProject({ organization_id: organizationId, client_id: clientId, name: form.name.trim(), type: form.type, deadline: form.deadline || null, url: form.url || null, status: 'actief', color: '#3db68e' })
      onCreated(project); setDone(true)
    } catch (e) { showToast('Fout bij opslaan: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <h2 style={{fontFamily:'var(--heading-font)',fontSize:19,fontWeight:700,marginBottom:6}}>Eerste project aanmaken</h2>
      <p style={{fontSize:13,color:'var(--text-muted)',marginBottom:18}}>Maak een project aan voor je klant. Een project is een opdracht, zoals het bouwen van een website.</p>
      <div className="form-group"><label>Projectnaam</label><input value={form.name} onChange={f('name')} autoFocus disabled={done} /></div>
      {firstClient
        ? <div className="form-group"><label>Klant</label><div style={{fontSize:13,padding:'8px 0'}}>{firstClient.fname} {firstClient.lname}{firstClient.company ? ' · ' + firstClient.company : ''}</div></div>
        : <div className="form-group"><label>Klantnaam (optioneel, wordt automatisch aangemaakt)</label><input value={form.clientName} onChange={f('clientName')} disabled={done} /></div>}
      <div className="form-row">
        <div className="form-group"><label>Projecttype</label><select value={form.type} onChange={f('type')} disabled={done}>{PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        <div className="form-group"><label>Deadline (optioneel)</label><input type="date" value={form.deadline} onChange={f('deadline')} disabled={done} /></div>
      </div>
      <div className="form-group"><label>Website URL (optioneel)</label><input type="url" value={form.url} onChange={f('url')} placeholder="https://" disabled={done} /></div>
      {done && <div className="ob-check">✓ Project aangemaakt!</div>}
      <div style={{marginTop:16}}>
        {!done
          ? <button className="btn btn-primary" style={{width:'100%',padding:'11px'}} onClick={create} disabled={saving}>{saving ? 'Opslaan…' : 'Project aanmaken'}</button>
          : <button className="btn btn-primary" style={{width:'100%',padding:'11px'}} onClick={onNext}>Volgende</button>}
      </div>
      {!done && <div style={{textAlign:'center',marginTop:12}}><span onClick={onSkip} style={{fontSize:12,color:'var(--text-faint)',cursor:'pointer',textDecoration:'underline'}}>Overslaan voor nu</span></div>}
    </div>
  )
}

function CompletedStep({ organizationId, firstClient, firstProject, onExit }) {
  const [busy, setBusy] = useState(false)
  const summary = []
  summary.push('je bedrijf ingesteld')
  if (firstClient) summary.push('1 klant toegevoegd')
  if (firstProject) summary.push('1 project aangemaakt')

  async function finish(keepDemo) {
    setBusy(true)
    try {
      await db.trackOnboardingEvent(organizationId, 'completed', 'completed')
      await db.completeOnboarding(organizationId)
      if (!keepDemo && firstClient && firstProject) await db.deleteDemoData(organizationId).catch(() => {})
    } finally {
      onExit()
    }
  }

  return (
    <div style={{textAlign:'center'}}>
      <h1 style={{fontFamily:'var(--heading-font)',fontSize:24,fontWeight:700,marginBottom:10}}>Je bent klaar om te starten 🎉</h1>
      <p style={{fontSize:14,color:'var(--text-muted)',marginBottom:24}}>Je hebt {summary.join(', ')}.</p>
      <button className="btn btn-primary" style={{width:'100%',padding:'12px',marginBottom:10}} onClick={() => finish(false)} disabled={busy}>Naar mijn dashboard</button>
      <button className="btn btn-ghost" style={{width:'100%',padding:'12px'}} onClick={() => finish(true)} disabled={busy}>Demo data bewaren</button>
    </div>
  )
}

const TOUR_TIPS = [
  { key: 'overview', text: 'Je dashboard: een overzicht van klanten, omzet en wat er nog moet gebeuren.' },
  { key: 'clients', text: 'Hier beheer je al je klanten en hun contactgegevens.' },
  { key: 'projects', text: 'Volg hier de voortgang van al je projecten.' },
  { key: 'finance', text: 'Stuur facturen en offertes en houd je omzet bij.' },
  { key: 'hosting', text: 'Bewaak hier domein- en SSL-verloopdatums van je klantsites.' },
  { key: 'pipeline', text: 'Volg nieuwe leads tot ze klant worden.' },
]

export function OnboardingTourOverlay({ onFinish }) {
  const [tipIndex, setTipIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const tip = TOUR_TIPS[tipIndex]

  useEffect(() => {
    const el = document.querySelector(`[data-tour="${tip.key}"]`)
    if (el) setRect(el.getBoundingClientRect())
    document.querySelectorAll('[data-tour]').forEach(n => n.classList.remove('tour-pulse'))
    if (el) el.classList.add('tour-pulse')
    return () => { if (el) el.classList.remove('tour-pulse') }
  }, [tipIndex, tip.key])

  return (
    <div style={{position:'fixed',inset:0,zIndex:999,pointerEvents:'none'}}>
      <style>{`
        @keyframes tour-pulse{0%,100%{box-shadow:0 0 0 0 rgba(61,182,142,.5)}50%{box-shadow:0 0 0 6px rgba(61,182,142,.25)}}
        .tour-pulse{animation:tour-pulse 1.4s ease-in-out infinite;border-radius:8px}
      `}</style>
      {rect && (
        <div style={{
          position:'fixed', top: rect.top, left: rect.right + 16, zIndex:1001, pointerEvents:'auto',
          background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r)',
          boxShadow:'var(--shadow-md)', padding:'14px 16px', maxWidth:260, fontSize:13
        }}>
          <div style={{marginBottom:10,lineHeight:1.5}}>{tip.text}</div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:11,color:'var(--text-faint)'}}>{tipIndex+1} / {TOUR_TIPS.length}</span>
            <div style={{display:'flex',gap:6}}>
              {tipIndex > 0 && <button className="btn btn-ghost btn-xs" onClick={() => setTipIndex(i => i-1)}>Vorige tip</button>}
              {tipIndex < TOUR_TIPS.length - 1
                ? <button className="btn btn-primary btn-xs" onClick={() => setTipIndex(i => i+1)}>Volgende tip</button>
                : <button className="btn btn-primary btn-xs" onClick={onFinish}>Tour voltooien</button>}
            </div>
          </div>
        </div>
      )}
      <div style={{position:'fixed',bottom:20,left:'50%',transform:'translateX(-50%)',pointerEvents:'auto'}}>
        <button className="btn btn-ghost btn-sm" style={{background:'var(--surface)',boxShadow:'var(--shadow-md)'}} onClick={onFinish}>Tour overslaan</button>
      </div>
    </div>
  )
}
