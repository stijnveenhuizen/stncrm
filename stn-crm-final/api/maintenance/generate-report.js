const React = require('react')
const { renderToBuffer, Document, Page, Text, View, Image, StyleSheet } = require('@react-pdf/renderer')
const { requireUser } = require('../_shared')

const MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']
const CATEGORY_LABEL = { update: 'Update', security: 'Beveiliging', backup: 'Backup', design: 'Ontwerp', content: 'Content', overig: 'Overig' }

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  logo: { width: 100, height: 40, objectFit: 'contain', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#555', marginBottom: 20 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8, textTransform: 'uppercase', color: '#333' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 6 },
  rowDate: { width: 70, color: '#555' },
  rowCategory: { width: 80, color: '#0d9488' },
  rowTitle: { flex: 1 },
  rowDesc: { fontSize: 10, color: '#777', marginTop: 2 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  footer: { marginTop: 30, fontSize: 10, color: '#777' },
})

function ReportDocument({ contract, client, logs, totalHours, companySettings, site, latestCheck, periodLabel }) {
  return React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: styles.page },
      companySettings?.logo_url && React.createElement(Image, { src: companySettings.logo_url, style: styles.logo }),
      React.createElement(Text, { style: styles.title }, `Onderhoud rapport — ${periodLabel}`),
      React.createElement(Text, { style: styles.subtitle }, `Klant: ${client?.fname || ''} ${client?.lname || ''}${client?.company ? ' · ' + client.company : ''}`),

      React.createElement(Text, { style: styles.sectionTitle }, 'Werkzaamheden'),
      logs.length === 0 ? React.createElement(Text, null, 'Geen werkzaamheden gelogd deze periode.') :
        logs.map((l, i) => React.createElement(View, { key: i, style: styles.row },
          React.createElement(Text, { style: styles.rowDate }, l.date),
          React.createElement(Text, { style: styles.rowCategory }, CATEGORY_LABEL[l.category] || l.category),
          React.createElement(View, { style: styles.rowTitle },
            React.createElement(Text, null, l.title),
            l.description && React.createElement(Text, { style: styles.rowDesc }, l.description)
          )
        )),

      React.createElement(Text, { style: styles.sectionTitle }, 'Overzicht'),
      React.createElement(View, { style: styles.statRow },
        React.createElement(Text, null, `Totaal uren: ${totalHours}`),
        contract.hours_per_month && React.createElement(Text, null, `Inbegrepen: ${contract.hours_per_month} · Resterend: ${Math.max(0, contract.hours_per_month - totalHours)}`)
      ),

      site && React.createElement(View, { style: { marginTop: 10 } },
        React.createElement(Text, { style: styles.sectionTitle }, 'Website status'),
        React.createElement(Text, null, `Uptime: ${latestCheck?.is_online ? 'online' : 'onbekend'} · PageSpeed: ${latestCheck?.pagespeed_mobile ?? '—'} · SSL geldig tot: ${latestCheck?.ssl_expires_at || 'onbekend'}`)
      ),

      React.createElement(Text, { style: styles.footer }, 'Met vriendelijke groet,'),
      React.createElement(Text, { style: styles.footer }, companySettings?.name || 'Jouw webdesignbureau')
    )
  )
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { service } = await requireUser(req)
    const { contractId, periodMonth, periodYear } = req.body || {}
    if (!contractId || !periodMonth || !periodYear) return res.status(400).json({ error: 'contractId, periodMonth en periodYear zijn verplicht.' })

    const { data: contract, error: cErr } = await service.from('maintenance_contracts').select('*, clients(fname, lname, company), hosting(site_name, domain)').eq('id', contractId).single()
    if (cErr || !contract) return res.status(404).json({ error: 'Contract niet gevonden.' })

    const { data: settingsRows } = await service.from('company_settings').select('*').eq('organization_id', contract.workspace_id).maybeSingle()
    const { data: orgRow } = await service.from('organizations').select('name').eq('id', contract.workspace_id).single()
    const companySettings = { ...(settingsRows || {}), name: orgRow?.name }

    const start = `${periodYear}-${String(periodMonth).padStart(2, '0')}-01`
    const end = new Date(periodYear, periodMonth, 0).toISOString().slice(0, 10)
    const { data: logs } = await service.from('maintenance_logs').select('*').eq('contract_id', contractId).gte('date', start).lte('date', end).order('date', { ascending: true })
    const totalHours = (logs || []).reduce((s, l) => s + Number(l.hours_spent || 0), 0)

    let latestCheck = null
    if (contract.site_id) {
      const { data: checks } = await service.from('website_checks').select('*').eq('site_id', contract.site_id).order('checked_at', { ascending: false }).limit(1)
      latestCheck = checks?.[0] || null
    }

    const periodLabel = `${MONTHS[periodMonth - 1]} ${periodYear}`
    const buffer = await renderToBuffer(ReportDocument({
      contract, client: contract.clients, logs: logs || [], totalHours, companySettings, site: contract.hosting, latestCheck, periodLabel,
    }))

    const storagePath = `${contractId}/${periodYear}-${String(periodMonth).padStart(2, '0')}.pdf`
    const { error: upErr } = await service.storage.from('maintenance-reports').upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })
    if (upErr) throw upErr

    const { data: report, error: rErr } = await service.from('maintenance_reports')
      .upsert([{ contract_id: contractId, period_month: periodMonth, period_year: periodYear, pdf_url: storagePath, generated_at: new Date().toISOString() }], { onConflict: 'contract_id,period_month,period_year' })
      .select().single()
    if (rErr) throw rErr

    res.status(200).json({ report })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
}
