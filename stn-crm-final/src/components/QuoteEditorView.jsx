import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import * as db from '../lib/db'
import { money, fdate, today, showToast } from './Dashboard.jsx'

const CATEGORIES = ['website', 'design', 'hosting', 'onderhoud', 'marketing', 'overig']
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`)

export default function QuoteEditorView({ quoteId, clients, activeOrgId, companySettings, showView }) {
  const [loading, setLoading] = useState(!!quoteId)
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('alle')
  const [existingStatus, setExistingStatus] = useState('concept')
  const [quoteNumber, setQuoteNumber] = useState(null)

  const [form, setForm] = useState({
    client_id: '', title: '', valid_until: '', notes: '', payment_terms: '',
    discount_percentage: '', show_hourly_breakdown: false, items: [],
  })

  useEffect(() => { if (activeOrgId) db.getQuoteTemplates(activeOrgId).then(setTemplates).catch(() => {}) }, [activeOrgId])

  useEffect(() => {
    if (!quoteId) { setLoading(false); return }
    db.getQuote(quoteId).then(q => {
      setForm({
        client_id: q.client_id || '', title: q.title || q.description || '', valid_until: q.valid_until || '',
        notes: q.notes || '', payment_terms: q.payment_terms || '', discount_percentage: q.discount_percentage ?? '',
        show_hourly_breakdown: !!q.show_hourly_breakdown, items: q.items || [],
      })
      setExistingStatus(q.status); setQuoteNumber(q.quote_number)
      setLoading(false)
    }).catch(e => { showToast('Fout bij laden: ' + e.message, 'error'); setLoading(false) })
  }, [quoteId])

  const client = clients.find(c => c.id === form.client_id)

  function addTemplate(t) {
    setForm(f => ({ ...f, items: [...f.items, { id: uid(), template_id: t.id, name: t.name, description: t.description, price: t.price, is_optional: t.is_optional, included: !t.is_optional }] }))
  }
  function addCustomLine() {
    setForm(f => ({ ...f, items: [...f.items, { id: uid(), template_id: null, name: 'Aangepaste regel', description: '', price: 0, is_optional: false, included: true }] }))
  }
  function updateItem(id, patch) {
    setForm(f => ({ ...f, items: f.items.map(it => it.id === id ? { ...it, ...patch } : it) }))
  }
  function removeItem(id) {
    setForm(f => ({ ...f, items: f.items.filter(it => it.id !== id) }))
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  function handleDragEnd(e) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setForm(f => {
      const oldIndex = f.items.findIndex(i => i.id === active.id)
      const newIndex = f.items.findIndex(i => i.id === over.id)
      return { ...f, items: arrayMove(f.items, oldIndex, newIndex) }
    })
  }

  const includedItems = form.items.filter(i => i.included !== false)
  const subtotal = includedItems.reduce((s, i) => s + (parseFloat(i.price) || 0), 0)
  const discountAmount = form.discount_percentage ? subtotal * (parseFloat(form.discount_percentage) / 100) : 0
  const afterDiscount = subtotal - discountAmount
  const btw = afterDiscount * 0.21
  const total = afterDiscount + btw

  const filteredTemplates = templates.filter(t =>
    (categoryFilter === 'alle' || t.category === categoryFilter) &&
    (!search.trim() || t.name.toLowerCase().includes(search.toLowerCase()))
  )

  async function save(sendNow) {
    if (!form.client_id) return showToast('Kies een klant.', 'error')
    if (!form.title.trim()) return showToast('Vul een offertetitel in.', 'error')
    setSaving(true)
    try {
      const payload = {
        client_id: form.client_id, title: form.title.trim(), description: form.title.trim(),
        valid_until: form.valid_until || null, notes: form.notes || null, payment_terms: form.payment_terms || null,
        discount_percentage: form.discount_percentage ? parseFloat(form.discount_percentage) : null,
        discount_amount: discountAmount || null, show_hourly_breakdown: form.show_hourly_breakdown,
        items: form.items, subtotal, btw_percentage: 21, total, amount: total,
        quote_template_ids: form.items.filter(i => i.template_id).map(i => i.template_id),
        ...(sendNow ? { status: 'verzonden', sent_at: new Date().toISOString() } : {}),
      }
      if (quoteId) await db.updateQuote(quoteId, payload)
      else await db.createQuote({ ...payload, status: sendNow ? 'verzonden' : 'concept' })
      showToast(sendNow ? 'Offerte verstuurd' : 'Offerte opgeslagen')
      showView('finance')
    } catch (e) { showToast('Fout: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  function previewPdf() {
    downloadQuoteEditorPdf({ form, client, subtotal, discountAmount, btw, total, companySettings, quoteNumber })
  }

  if (loading) return <div className="content"><div className="empty">Laden…</div></div>

  return (
    <div className="content" style={{ maxWidth: 1400 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => showView('finance')}>← Terug</button>
          <h3 style={{ fontFamily: 'var(--heading-font)', fontSize: 16, fontWeight: 700 }}>{quoteId ? 'Offerte bewerken' : 'Nieuwe offerte'}</h3>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => save(false)} disabled={saving}>{saving ? 'Opslaan…' : 'Opslaan als concept'}</button>
          <button className="btn btn-ghost btn-sm" onClick={previewPdf}>Voorbeeld PDF</button>
          <button className="btn btn-primary btn-sm" onClick={() => save(true)} disabled={saving}>Versturen naar klant</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, alignItems: 'start' }}>
        <div>
          <div className="sc" style={{ marginBottom: 16 }}>
            <div className="sc-head"><span className="sc-title">Basisinfo</span></div>
            <div className="sc-body">
              <div className="form-row">
                <div className="form-group"><label>Klant</label>
                  <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
                    <option value="">— Kies een klant —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.fname} {c.lname}{c.company ? ` (${c.company})` : ''}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Geldig tot</label><input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} /></div>
              </div>
              <div className="form-group"><label>Offertetitel</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Bijv. Nieuwe website voor Bakkerij Jansen" /></div>
              <div className="form-group"><label>Inleiding (optioneel)</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} /></div>
            </div>
          </div>

          <div className="sc" style={{ marginBottom: 16 }}>
            <div className="sc-head"><span className="sc-title">Prijsblokken bibliotheek</span></div>
            <div className="sc-body">
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoeken…" style={{ flex: 1 }} />
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ width: 'auto' }}>
                  <option value="alle">Alle categorieën</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {!templates.length ? (
                <div className="empty">Nog geen prijsblokken. Voeg ze toe via Bedrijfsinstellingen → Prijsblokken.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {filteredTemplates.map(t => {
                    const added = form.items.some(i => i.template_id === t.id)
                    return (
                      <motion.div key={t.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        style={{ border: `1px solid ${added ? 'var(--accent)' : 'var(--border-default)'}`, borderRadius: 'var(--rsm)', padding: 12, cursor: 'pointer' }}
                        onClick={() => !added && addTemplate(t)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}{added && ' ✓'}</div>
                        </div>
                        {t.description && <div style={{ fontSize: 11, color: 'var(--text-muted-tok)', margin: '4px 0' }}>{t.description}</div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                          <span style={{ fontFamily: 'var(--mono-font, monospace)', fontSize: 13 }}>{money(t.price)}</span>
                          <button className="btn btn-ghost btn-xs" disabled={added} onClick={e => { e.stopPropagation(); addTemplate(t) }}>{added ? 'Toegevoegd' : '+ Toevoegen'}</button>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="sc" style={{ marginBottom: 16 }}>
            <div className="sc-head"><span className="sc-title">Geselecteerde items</span></div>
            <div className="sc-body">
              {!form.items.length ? <div className="empty">Nog geen items geselecteerd.</div> : (
                <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                  <SortableContext items={form.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    {form.items.map(item => <SortableQuoteItem key={item.id} item={item} onUpdate={updateItem} onRemove={removeItem} />)}
                  </SortableContext>
                </DndContext>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={addCustomLine}>+ Aangepaste regel toevoegen</button>
            </div>
          </div>

          <div className="sc">
            <div className="sc-head"><span className="sc-title">Totalen</span></div>
            <div className="sc-body">
              <div className="info-row"><span className="info-label">Subtotaal</span><span className="info-val" style={{ fontFamily: 'var(--mono-font, monospace)' }}>{money(subtotal)}</span></div>
              <div className="info-row">
                <span className="info-label">Korting (%)</span>
                <input type="number" min="0" max="100" value={form.discount_percentage} onChange={e => setForm(f => ({ ...f, discount_percentage: e.target.value }))} style={{ width: 80 }} />
              </div>
              {discountAmount > 0 && <div className="info-row"><span className="info-label">Kortingsbedrag</span><span className="info-val" style={{ fontFamily: 'var(--mono-font, monospace)', color: 'var(--danger)' }}>-{money(discountAmount)}</span></div>}
              <div className="info-row"><span className="info-label">BTW (21%)</span><span className="info-val" style={{ fontFamily: 'var(--mono-font, monospace)' }}>{money(btw)}</span></div>
              <div className="info-row" style={{ borderTop: '1px solid var(--border-default)', paddingTop: 10, marginTop: 6 }}>
                <span className="info-label" style={{ fontWeight: 700 }}>Totaal</span><span className="info-val" style={{ fontFamily: 'var(--mono-font, monospace)', fontWeight: 700, fontSize: 16 }}>{money(total)}</span>
              </div>
              <div className="form-group" style={{ marginTop: 12 }}><label>Betalingstermijnen</label><input value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} placeholder="Bijv. 50% vooraf, 50% na oplevering" /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={form.show_hourly_breakdown} onChange={e => setForm(f => ({ ...f, show_hourly_breakdown: e.target.checked }))} /> Toon uren-specificatie op de offerte</label>
            </div>
          </div>
        </div>

        <div style={{ position: 'sticky', top: 16 }}>
          <QuotePreview form={form} client={client} subtotal={subtotal} discountAmount={discountAmount} btw={btw} total={total} companySettings={companySettings} quoteNumber={quoteNumber} />
        </div>
      </div>
    </div>
  )
}

function SortableQuoteItem({ item, onUpdate, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <motion.div ref={setNodeRef} style={style} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="info-row" >
      <span {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--text-faint)', flexShrink: 0 }}>⠿</span>
      <div style={{ flex: 1 }}>
        <input value={item.name} onChange={e => onUpdate(item.id, { name: e.target.value })} style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }} />
        {item.is_optional && (
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={item.included !== false} onChange={e => onUpdate(item.id, { included: e.target.checked })} /> Optioneel — meenemen in offerte
          </label>
        )}
      </div>
      <input type="number" step="0.01" value={item.price} onChange={e => onUpdate(item.id, { price: e.target.value })} style={{ width: 90, fontFamily: 'var(--mono-font, monospace)' }} />
      <button type="button" className="task-del" onClick={() => onRemove(item.id)} aria-label="Verwijderen">×</button>
    </motion.div>
  )
}

function QuotePreview({ form, client, subtotal, discountAmount, btw, total, companySettings, quoteNumber }) {
  const included = form.items.filter(i => i.included !== false)
  return (
    <div className="sc" style={{ background: 'var(--surface)', padding: 28 }}>
      {companySettings?.logo_url && <img src={companySettings.logo_url} alt="" style={{ maxHeight: 40, marginBottom: 16 }} />}
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>{quoteNumber || 'Concept'}</div>
      <h2 style={{ fontFamily: 'var(--heading-font)', fontSize: 20, marginBottom: 4 }}>{form.title || 'Offertetitel'}</h2>
      <div style={{ fontSize: 12, color: 'var(--text-muted-tok)', marginBottom: 4 }}>Datum: {fdate(today())}{form.valid_until ? ` · Geldig tot ${fdate(form.valid_until)}` : ''}</div>
      {client && <div style={{ fontSize: 13, marginBottom: 16 }}>Voor: <strong>{client.fname} {client.lname}</strong>{client.company ? ` — ${client.company}` : ''}</div>}
      {form.notes && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>{form.notes}</p>}
      <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 10 }}>
        {!included.length ? <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nog geen items</div> : included.map(i => (
          <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--border-default)' }}>
            <span>{i.name}</span><span style={{ fontFamily: 'var(--mono-font, monospace)' }}>{money(i.price)}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotaal</span><span>{money(subtotal)}</span></div>
        {discountAmount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}><span>Korting</span><span>-{money(discountAmount)}</span></div>}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>BTW (21%)</span><span>{money(btw)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, marginTop: 6, borderTop: '1px solid var(--border-default)', paddingTop: 6 }}><span>Totaal</span><span>{money(total)}</span></div>
      </div>
      {form.payment_terms && <div style={{ fontSize: 12, color: 'var(--text-muted-tok)', marginTop: 14 }}>{form.payment_terms}</div>}
      <button className="btn btn-primary btn-sm" style={{ marginTop: 20, width: '100%' }} disabled>Offerte accepteren (klantportaal)</button>
    </div>
  )
}

function downloadQuoteEditorPdf({ form, client, subtotal, discountAmount, btw, total, companySettings, quoteNumber }) {
  const w = window.open('', '_blank')
  if (!w) return
  const included = form.items.filter(i => i.included !== false)
  const rows = included.map(i => `<tr><td>${i.name}</td><td style="text-align:right">${money(i.price)}</td></tr>`).join('')
  w.document.write(`<html><head><title>Offerte ${quoteNumber || ''}</title><style>
    body{font-family:Arial,sans-serif;padding:40px;color:#111}
    h1{font-size:20px;margin-bottom:4px} .sub{color:#666;font-size:13px;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px} td{padding:6px 0;border-bottom:1px solid #e5e5e5}
    .totals div{display:flex;justify-content:space-between;max-width:320px;margin-bottom:4px;font-size:13px}
  </style></head><body>
    ${companySettings?.logo_url ? `<img src="${companySettings.logo_url}" style="max-height:40px;margin-bottom:16px" />` : ''}
    <h1>${form.title || 'Offerte'}</h1>
    <div class="sub">${quoteNumber || 'Concept'} · ${fdate(today())}${form.valid_until ? ' · Geldig tot ' + fdate(form.valid_until) : ''}</div>
    ${client ? `<div class="sub">Voor: ${client.fname} ${client.lname}${client.company ? ' — ' + client.company : ''}</div>` : ''}
    ${form.notes ? `<p>${form.notes}</p>` : ''}
    <table>${rows}</table>
    <div class="totals">
      <div><span>Subtotaal</span><span>${money(subtotal)}</span></div>
      ${discountAmount > 0 ? `<div><span>Korting</span><span>-${money(discountAmount)}</span></div>` : ''}
      <div><span>BTW (21%)</span><span>${money(btw)}</span></div>
      <div style="font-weight:700;font-size:15px"><span>Totaal</span><span>${money(total)}</span></div>
    </div>
    ${form.payment_terms ? `<p style="color:#666;font-size:12px">${form.payment_terms}</p>` : ''}
  </body></html>`)
  w.document.close(); w.focus(); w.print()
}
