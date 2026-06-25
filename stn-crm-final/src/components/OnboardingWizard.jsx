import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import confetti from 'canvas-confetti'
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
const PROJECT_TYPES = ['WordPress', 'Webflow', 'Custom', 'Anders']
const TOUR_TIPS = [
  { key: 'overview', label: 'Dashboard', text: 'Zie in één oogopslag hoe je bedrijf presteert.' },
  { key: 'clients', label: 'Klanten', text: 'Beheer al je klanten en hun contactgegevens.' },
  { key: 'projects', label: 'Projecten', text: 'Houd de voortgang van elk websiteproject bij.' },
  { key: 'finance', label: 'Financiën', text: 'Verstuur facturen en volg je inkomsten.' },
  { key: 'hosting', label: 'Hosting', text: 'Weet wanneer domeinen en SSL-certificaten verlopen.' },
  { key: 'pipeline', label: 'Pipeline', text: 'Volg je potentiële klanten van lead tot opdracht.' },
]

const CSS = `
  .ob-overlay{position:fixed;inset:0;background:#F8F9FA;z-index:1000;display:flex;flex-direction:column;overflow-y:auto}
  [data-theme="dark"] .ob-overlay{background:var(--bg)}
  .ob-progress-track{height:4px;background:var(--bg2);width:100%;flex-shrink:0}
  .ob-progress-fill{height:100%;background:var(--accent)}
  .ob-head{display:flex;align-items:center;justify-content:space-between;padding:18px 28px;flex-shrink:0}
  .ob-dots{display:flex;align-items:center;gap:10px}
  .ob-dot{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;position:relative}
  .ob-skip{font-size:12px;color:var(--text-faint);cursor:pointer;background:none;border:none;flex-shrink:0}
  .ob-skip:hover{color:var(--text-muted)}
  .ob-body{flex:1;display:flex;align-items:center;justify-content:center;padding:24px}
  .ob-card{width:100%;max-width:560px;background:var(--surface);border-radius:16px;padding:36px;box-shadow:0 8px 32px rgba(20,20,30,.08)}
  .ob-card.wide{max-width:920px}
  .ob-footer{display:flex;justify-content:space-between;padding:18px 28px;flex-shrink:0;max-width:560px;margin:0 auto;width:100%}
  .ob-h1{font-family:var(--heading-font);font-size:2rem;font-weight:700;letter-spacing:-.01em;margin-bottom:10px}
  .ob-h2{font-family:var(--heading-font);font-size:1.5rem;font-weight:700;letter-spacing:-.01em;margin-bottom:8px}
  .ob-sub{font-size:14px;color:var(--text-muted);line-height:1.6;margin-bottom:8px}
  .ob-icon-row{display:flex;gap:18px;justify-content:center;margin:32px 0;flex-wrap:wrap}
  .ob-icon-item{flex:1;min-width:110px;text-align:center;font-size:12px;color:var(--text-muted)}
  .ob-icon-circle{width:52px;height:52px;border-radius:16px;background:var(--accent-soft);color:var(--accent-text);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;font-size:22px}
  .ob-field{margin-bottom:18px;position:relative}
  .ob-field input,.ob-field select,.ob-field textarea{border-radius:12px;padding:14px;font-size:14px;border:1.5px solid var(--border-strong)}
  .ob-field label{position:absolute;left:14px;top:14px;font-size:14px;color:var(--text-faint);pointer-events:none;transform-origin:left top;transition:transform .15s,top .15s,font-size .15s,color .15s;text-transform:none;font-weight:500;letter-spacing:0;background:var(--surface);padding:0 4px}
  .ob-field label.float{top:-8px;font-size:11px;color:var(--accent-text);font-weight:600}
  .ob-field .ob-error-text{font-size:11px;color:var(--red-text);margin-top:5px}
  .ob-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .ob-dropzone{border:2px dashed var(--border-strong);border-radius:14px;padding:24px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s;font-size:13px;color:var(--text-muted)}
  .ob-dropzone:hover,.ob-dropzone.drag{border-color:var(--accent);background:var(--accent-soft)}
  .ob-check-banner{display:flex;align-items:center;gap:10px;background:var(--green-soft);color:var(--green-text);padding:12px 16px;border-radius:12px;font-size:14px;font-weight:600;margin-top:14px}
  .ob-type-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  .ob-type-card{border:1.5px solid var(--border);border-radius:12px;padding:14px;text-align:center;cursor:pointer;font-size:13px;font-weight:500;background:var(--surface)}
  .ob-type-card.sel{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-text);font-weight:600}
  @media(max-width:600px){
    .ob-card{padding:22px;border-radius:14px}
    .ob-row{grid-template-columns:1fr}
    .ob-footer,.ob-head{padding:14px 16px}
    .ob-h1{font-size:1.6rem}
    .ob-footer .btn{flex:1}
  }
`

const cardVariants = {
  enter: dir => ({ opacity: 0, x: dir >= 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0 },
  exit: dir => ({ opacity: 0, x: dir >= 0 ? -40 : 40 }),
}

function MotionButton({ children, primary, ghost, disabled, onClick, style, type }) {
  return (
    <motion.button
      type={type || 'button'}
      className={primary ? 'btn btn-primary' : 'btn btn-ghost'}
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled ? { scale: 1.02, boxShadow: primary ? '0 6px 18px rgba(61,182,142,.3)' : 'none' } : {}}
      whileTap={!disabled ? { scale: 0.97 } : {}}
      style={style}
    >{children}</motion.button>
  )
}

function FloatingInput({ label, value, onChange, type = 'text', required, error, autoFocus, disabled, placeholder }) {
  const [focused, setFocused] = useState(false)
  const float = focused || !!value
  return (
    <div className="ob-field">
      <input
        type={type} value={value} onChange={onChange} autoFocus={autoFocus} disabled={disabled}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        placeholder={focused ? (placeholder || '') : ''}
        style={{ borderColor: error ? 'var(--red)' : focused ? 'var(--accent)' : undefined, boxShadow: focused ? '0 0 0 3px rgba(61,182,142,.15)' : 'none' }}
      />
      <motion.label className={float ? 'float' : ''} animate={{ top: float ? -8 : 14, fontSize: float ? 11 : 14 }} transition={{ duration: 0.15 }}>
        {label}{required ? ' *' : ''}
      </motion.label>
      {error && <div className="ob-error-text">{error}</div>}
    </div>
  )
}

function ShakeWrap({ shake, children }) {
  return (
    <motion.div animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }} transition={{ duration: 0.4 }}>
      {children}
    </motion.div>
  )
}

function SuccessBanner({ text }) {
  return (
    <motion.div className="ob-check-banner" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.span
        initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} transition={{ duration: 0.5, type: 'spring' }}
        style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}
      >✓</motion.span>
      <span>{text}</span>
    </motion.div>
  )
}

function ProgressHeader({ stepIndex, onSkipAll, showSkip }) {
  return (
    <>
      <div className="ob-progress-track">
        <motion.div className="ob-progress-fill" animate={{ width: ((stepIndex + 1) / 6 * 100) + '%' }} transition={{ duration: 0.5, ease: 'easeOut' }} />
      </div>
      <div className="ob-head">
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--heading-font)' }}>STN CRM</div>
        <div className="ob-dots">
          {ONBOARDING_STEPS.map((s, i) => (
            <div key={s} className="ob-dot" style={{
              background: i < stepIndex ? 'var(--accent)' : i === stepIndex ? 'var(--surface)' : 'var(--bg2)',
              border: i === stepIndex ? '2px solid var(--accent)' : i < stepIndex ? 'none' : '1px solid var(--border)',
              color: i < stepIndex ? '#fff' : i === stepIndex ? 'var(--accent-text)' : 'var(--text-faint)',
            }}>
              {i < stepIndex ? '✓' : i + 1}
              {i === stepIndex && (
                <motion.span style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: '2px solid var(--accent)' }}
                  animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.35, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
              )}
            </div>
          ))}
        </div>
        {showSkip ? <button className="ob-skip" onClick={onSkipAll}>Overslaan</button> : <div style={{ width: 60 }} />}
      </div>
    </>
  )
}

export default function OnboardingWizard({ stepIndex, organizationId, orgName, profile, onStepIndexChange, onExit }) {
  const [direction, setDirection] = useState(1)
  const [firstClient, setFirstClient] = useState(null)
  const [firstProject, setFirstProject] = useState(null)
  const viewedRef = useRef(null)
  const step = ONBOARDING_STEPS[stepIndex]

  useEffect(() => {
    if (viewedRef.current === step) return
    viewedRef.current = step
    db.trackOnboardingEvent(organizationId, step, 'viewed').catch(() => {})
  }, [step, organizationId])

  useEffect(() => {
    if (step === 'demo_tour') {
      db.hasDemoData(organizationId).then(has => { if (!has) return db.createDemoData(organizationId) }).catch(() => {})
    }
  }, [step, organizationId])

  function goTo(idx, dir) { setDirection(dir); onStepIndexChange(Math.max(0, Math.min(idx, 5))) }
  async function goNext(track = true) {
    if (track) { try { await db.trackOnboardingEvent(organizationId, step, 'completed') } catch (e) {} }
    goTo(stepIndex + 1, 1)
  }
  async function skipStepOnly() {
    try { await db.trackOnboardingEvent(organizationId, step, 'skipped') } catch (e) {}
    goTo(stepIndex + 1, 1)
  }
  function goBack() { goTo(stepIndex - 1, -1) }
  async function skipAll() {
    try {
      await db.createDemoData(organizationId)
      await db.trackOnboardingEvent(organizationId, step, 'skipped')
      await db.skipOnboarding(organizationId)
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    onExit('skipped')
  }

  return (
    <div className="ob-overlay">
      <style>{CSS}</style>
      <ProgressHeader stepIndex={stepIndex} onSkipAll={skipAll} showSkip={step !== 'completed'} />
      <div className="ob-body">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step} custom={direction} variants={cardVariants} initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={`ob-card${step === 'demo_tour' ? ' wide' : ''}`}
          >
            {step === 'welcome' && <WelcomeStep orgName={orgName} onStart={() => goNext()} onLookAround={skipAll} />}
            {step === 'company_setup' && <CompanyStep organizationId={organizationId} orgName={orgName} profile={profile} onNext={() => goNext()} />}
            {step === 'first_client' && <FirstClientStep organizationId={organizationId} onCreated={setFirstClient} onNext={() => goNext()} onSkip={skipStepOnly} />}
            {step === 'first_project' && <FirstProjectStep organizationId={organizationId} firstClient={firstClient} onCreated={setFirstProject} onNext={() => goNext()} onSkip={skipStepOnly} />}
            {step === 'demo_tour' && <DemoTourStep onFinish={() => goNext(false)} />}
            {step === 'completed' && <CompletedStep organizationId={organizationId} orgName={orgName} firstClient={firstClient} firstProject={firstProject} onExit={onExit} />}
          </motion.div>
        </AnimatePresence>
      </div>
      {!['welcome', 'completed', 'demo_tour'].includes(step) && (
        <div className="ob-footer">
          <MotionButton onClick={goBack}>← Terug</MotionButton>
          <div />
        </div>
      )}
    </div>
  )
}

const stagger = i => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.1 + i * 0.1, duration: 0.4 } })

function WelcomeStep({ orgName, onStart, onLookAround }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
        style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', fontSize: 28, fontFamily: 'var(--heading-font)', fontWeight: 700, boxShadow: '0 8px 20px rgba(61,182,142,.35)' }}
      >S</motion.div>
      <motion.h1 className="ob-h1" {...stagger(0)}>Welkom bij STN CRM{orgName ? ', ' + orgName : ''}</motion.h1>
      <motion.p className="ob-sub" {...stagger(1)}>Het CRM dat speciaal is gebouwd voor webdesigners. Stel in 5 minuten je werkruimte in.</motion.p>
      <div className="ob-icon-row">
        {[['◐','Klanten','Beheer al je klanten op één plek'],['▣','Projecten','Houd voortgang en deadlines bij'],['€','Facturen','Verstuur en volg je facturen']].map(([icon,name,desc],i) => (
          <motion.div key={name} className="ob-icon-item" {...stagger(2+i)}>
            <div className="ob-icon-circle">{icon}</div>
            <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{name}</div>
            <div>{desc}</div>
          </motion.div>
        ))}
      </div>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6, duration: 0.3 }}>
        <MotionButton primary onClick={onStart} style={{ width: '100%', padding: '13px', fontSize: 15 }}>Aan de slag →</MotionButton>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} style={{ marginTop: 14 }}>
        <span onClick={onLookAround} style={{ fontSize: 12, color: 'var(--text-faint)', cursor: 'pointer', textDecoration: 'underline' }}>Ik wil eerst rondkijken</span>
      </motion.div>
    </div>
  )
}

function CompanyStep({ organizationId, orgName, profile, onNext }) {
  const [form, setForm] = useState({ name: orgName || '', fullName: profile?.full_name || '', vat: '', coc: '', street: '', zip: '', city: '' })
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [drag, setDrag] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [shake, setShake] = useState(false)
  const fileRef = useRef()
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  function pickFile(file) {
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }
  function handleDrop(e) { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files[0]) }

  async function save() {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Bedrijfsnaam is verplicht'
    if (!form.fullName.trim()) errs.fullName = 'Je naam is verplicht'
    setErrors(errs)
    if (Object.keys(errs).length) { setShake(true); setTimeout(() => setShake(false), 400); return }
    setSaving(true)
    try {
      await db.updateOrganization(organizationId, { name: form.name.trim() })
      if (profile?.id) await db.upsertProfile(profile.id, { full_name: form.fullName.trim() }).catch(() => {})
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
      <h2 className="ob-h2">Vertel ons over je bedrijf</h2>
      <p className="ob-sub" style={{ marginBottom: 22 }}>Deze gegevens verschijnen op je facturen en in het klantportaal.</p>
      <ShakeWrap shake={shake}>
        <FloatingInput label="Bedrijfsnaam" value={form.name} onChange={f('name')} required error={errors.name} autoFocus />
        <FloatingInput label="Jouw naam" value={form.fullName} onChange={f('fullName')} required error={errors.fullName} />
      </ShakeWrap>
      <div className="ob-field">
        <div className="ob-dropzone" style={drag ? { borderColor: 'var(--accent)' } : {}} onClick={() => fileRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={handleDrop}>
          {logoPreview
            ? <img src={logoPreview} alt="logo preview" style={{ height: 48, objectFit: 'contain' }} />
            : 'Logo uploaden — klik of sleep een PNG/JPG/SVG hierheen (max 2MB)'}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => pickFile(e.target.files[0])} />
      </div>
      <div className="ob-row">
        <FloatingInput label="BTW-nummer (optioneel)" value={form.vat} onChange={f('vat')} />
        <FloatingInput label="KVK-nummer (optioneel)" value={form.coc} onChange={f('coc')} />
      </div>
      <FloatingInput label="Straat + huisnummer" value={form.street} onChange={f('street')} />
      <div className="ob-row">
        <FloatingInput label="Postcode" value={form.zip} onChange={f('zip')} />
        <FloatingInput label="Stad" value={form.city} onChange={f('city')} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 16 }}>Je kunt dit later altijd aanpassen via Bedrijfsinstellingen.</div>
      <MotionButton primary onClick={save} disabled={saving} style={{ width: '100%', padding: '13px' }}>
        {saving ? <Spinner /> : 'Volgende'}
      </MotionButton>
    </div>
  )
}

function Spinner() {
  return <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
    style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,.4)', borderTopColor: '#fff', borderRadius: '50%' }} />
}

function FirstClientStep({ organizationId, onCreated, onNext, onSkip }) {
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [errors, setErrors] = useState({})
  const [shake, setShake] = useState(false)
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  async function create() {
    if (!form.name.trim()) {
      setErrors({ name: 'Naam contactpersoon is verplicht' }); setShake(true); setTimeout(() => setShake(false), 400); return
    }
    setSaving(true)
    try {
      const [fname, ...rest] = form.name.trim().split(' ')
      const client = await db.createClient({ organization_id: organizationId, fname, lname: rest.join(' ') || '—', company: form.company || null, email: form.email || null, phone: form.phone || null, status: 'actief' })
      onCreated(client); setDone(true)
      setTimeout(() => setShowNext(true), 1500)
    } catch (e) { showToast('Fout bij opslaan: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <h2 className="ob-h2">Voeg je eerste klant toe</h2>
      <p className="ob-sub" style={{ marginBottom: 22 }}>Een klant is een bedrijf of persoon waarvoor je een project uitvoert.</p>
      <ShakeWrap shake={shake}>
        <FloatingInput label="Naam contactpersoon" value={form.name} onChange={f('name')} required error={errors.name} autoFocus disabled={done} />
      </ShakeWrap>
      <FloatingInput label="Bedrijfsnaam" value={form.company} onChange={f('company')} disabled={done} />
      <div className="ob-row">
        <FloatingInput label="E-mailadres" type="email" value={form.email} onChange={f('email')} disabled={done} />
        <FloatingInput label="Telefoonnummer" value={form.phone} onChange={f('phone')} disabled={done} />
      </div>
      <AnimatePresence>{done && <SuccessBanner text="Klant toegevoegd!" />}</AnimatePresence>
      <div style={{ marginTop: 16 }}>
        {!done && <MotionButton primary onClick={create} disabled={saving} style={{ width: '100%', padding: '13px' }}>{saving ? <Spinner /> : 'Klant toevoegen'}</MotionButton>}
        <AnimatePresence>
          {showNext && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <MotionButton primary onClick={onNext} style={{ width: '100%', padding: '13px' }}>Volgende</MotionButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {!done && <div style={{ textAlign: 'center', marginTop: 12 }}><span onClick={onSkip} style={{ fontSize: 12, color: 'var(--text-faint)', cursor: 'pointer', textDecoration: 'underline' }}>Geen klant bij de hand? Stap overslaan →</span></div>}
    </div>
  )
}

function FirstProjectStep({ organizationId, firstClient, onCreated, onNext, onSkip }) {
  const [form, setForm] = useState({ name: '', clientName: '', type: 'WordPress', deadline: '', url: '' })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [errors, setErrors] = useState({})
  const [shake, setShake] = useState(false)
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  async function create() {
    if (!form.name.trim()) {
      setErrors({ name: 'Projectnaam is verplicht' }); setShake(true); setTimeout(() => setShake(false), 400); return
    }
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
      setTimeout(() => setShowNext(true), 1500)
    } catch (e) { showToast('Fout bij opslaan: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <h2 className="ob-h2">Maak je eerste project aan</h2>
      <p className="ob-sub" style={{ marginBottom: 22 }}>Koppel een project aan je klant en houd de voortgang bij.</p>
      <ShakeWrap shake={shake}>
        <FloatingInput label="Projectnaam" value={form.name} onChange={f('name')} required error={errors.name} autoFocus disabled={done} />
      </ShakeWrap>
      {firstClient
        ? <div className="ob-field" style={{ fontSize: 13, padding: '12px 0' }}>Klant: <strong>{firstClient.fname} {firstClient.lname}{firstClient.company ? ' · ' + firstClient.company : ''}</strong></div>
        : <FloatingInput label="Klantnaam (optioneel)" value={form.clientName} onChange={f('clientName')} disabled={done} />}
      <div className="ob-field">
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Projecttype</div>
        <div className="ob-type-grid">
          {PROJECT_TYPES.map(t => (
            <motion.div key={t} className={`ob-type-card${form.type === t ? ' sel' : ''}`}
              onClick={() => !done && setForm(p => ({ ...p, type: t }))}
              animate={form.type === t ? { scale: [0.98, 1.02, 1] } : { scale: 1 }} transition={{ duration: 0.25 }}
            >{t}</motion.div>
          ))}
        </div>
      </div>
      <div className="ob-row">
        <FloatingInput label="Deadline (optioneel)" type="date" value={form.deadline} onChange={f('deadline')} disabled={done} />
        <FloatingInput label="Website URL (optioneel)" type="url" value={form.url} onChange={f('url')} disabled={done} />
      </div>
      <AnimatePresence>{done && <SuccessBanner text="Project aangemaakt!" />}</AnimatePresence>
      <div style={{ marginTop: 16 }}>
        {!done && <MotionButton primary onClick={create} disabled={saving} style={{ width: '100%', padding: '13px' }}>{saving ? <Spinner /> : 'Project aanmaken'}</MotionButton>}
        <AnimatePresence>
          {showNext && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <MotionButton primary onClick={onNext} style={{ width: '100%', padding: '13px' }}>Volgende</MotionButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {!done && <div style={{ textAlign: 'center', marginTop: 12 }}><span onClick={onSkip} style={{ fontSize: 12, color: 'var(--text-faint)', cursor: 'pointer', textDecoration: 'underline' }}>Overslaan voor nu</span></div>}
    </div>
  )
}

function DemoTourStep({ onFinish }) {
  const [tipIndex, setTipIndex] = useState(0)
  const tip = TOUR_TIPS[tipIndex]
  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 360 }}>
      <div style={{ flex: '0 0 40%', padding: '8px 28px 8px 0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Tip {tipIndex + 1} van {TOUR_TIPS.length}</div>
          <AnimatePresence mode="wait">
            <motion.div key={tip.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
              <h3 style={{ fontFamily: 'var(--heading-font)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{tip.label}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>{tip.text}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {TOUR_TIPS.map((t, i) => <div key={t.key} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= tipIndex ? 'var(--accent)' : 'var(--bg2)' }} />)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <button className="ob-skip" onClick={onFinish}>Tour overslaan</button>
            {tipIndex < TOUR_TIPS.length - 1
              ? <MotionButton primary onClick={() => setTipIndex(i => i + 1)}>Volgende tip →</MotionButton>
              : <MotionButton primary onClick={onFinish}>Klaar, naar dashboard →</MotionButton>}
          </div>
        </div>
      </div>
      <div style={{ flex: '0 0 60%', borderRadius: 14, overflow: 'hidden', background: 'var(--bg2)', position: 'relative' }}>
        <AnimatePresence mode="wait">
          <motion.div key={tip.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
            style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, padding: 20 }}
          >
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, fontFamily: 'var(--heading-font)' }}>
              {tip.label[0]}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{tip.label}-scherm</div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function CompletedStep({ organizationId, orgName, firstClient, firstProject, onExit }) {
  const [busy, setBusy] = useState(false)
  const parts = [orgName ? `${orgName} ingesteld` : 'je bedrijf ingesteld']
  if (firstClient) parts.push(`${firstClient.fname} ${firstClient.lname} toegevoegd als klant`)
  if (firstProject) parts.push(`${firstProject.name} aangemaakt als eerste project`)

  function fireConfetti() {
    const duration = 2000
    const end = Date.now() + duration
    const colors = ['#3db68e', '#a7e8d3', '#ffffff']
    ;(function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors })
      confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors })
      if (Date.now() < end) requestAnimationFrame(frame)
    })()
  }

  async function finish(keepDemo) {
    setBusy(true)
    if (!keepDemo) fireConfetti()
    try {
      await db.trackOnboardingEvent(organizationId, 'completed', 'completed')
      await db.completeOnboarding(organizationId)
      if (!keepDemo && firstClient && firstProject) await db.deleteDemoData(organizationId).catch(() => {})
    } finally {
      setTimeout(() => onExit('completed'), keepDemo ? 0 : 600)
    }
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} transition={{ duration: 0.6, type: 'spring' }}
        style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32 }}
      >✓</motion.div>
      <h1 className="ob-h1">Je bent klaar om te starten!</h1>
      <p className="ob-sub" style={{ marginBottom: 26 }}>Je hebt {parts.join(', ')}.</p>
      <MotionButton primary onClick={() => finish(false)} disabled={busy} style={{ width: '100%', padding: '13px', marginBottom: 10 }}>Naar mijn dashboard →</MotionButton>
      <MotionButton onClick={() => finish(true)} disabled={busy} style={{ width: '100%', padding: '13px' }}>Demo data bewaren</MotionButton>
    </div>
  )
}
