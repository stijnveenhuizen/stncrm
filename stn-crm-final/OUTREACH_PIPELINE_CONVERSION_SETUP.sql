-- VOORSTEL — nog niet uitgevoerd.

-- ═══════════════════════════════════════════════════════════════════════
-- Zodra een prospect op een flow-mail reageert én de flow daardoor stopt
-- (het huidige, standaard- of expliciet ingestelde reply-gedrag), wordt
-- er automatisch een lead aangemaakt in de standaard-pipeline (stage 1).
-- Deze kolom voorkomt dubbele leads als een prospect via meerdere flows
-- reageert, of als de reply-webhook een keer dubbel binnenkomt.
-- ═══════════════════════════════════════════════════════════════════════
alter table outreach_prospects add column if not exists converted_pipeline_id uuid references pipeline(id);
