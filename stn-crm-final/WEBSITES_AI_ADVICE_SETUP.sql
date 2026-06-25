-- Voer dit uit NA WEBSITES_MODULE_SETUP.sql.
--
-- AI-prestatieadvies op basis van PageSpeed-data: slaat de concrete
-- verbeterpunten (Lighthouse "opportunities") per check op, en cachet het
-- laatst gegenereerde AI-advies op de site zelf (zelfde patroon als
-- pipeline.ai_summary).

alter table website_checks add column if not exists pagespeed_audits jsonb;
alter table hosting add column if not exists ai_advice text;
alter table hosting add column if not exists ai_advice_generated_at timestamptz;
