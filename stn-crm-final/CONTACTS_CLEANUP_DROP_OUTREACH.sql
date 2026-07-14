-- Contact-centrische architectuur — laatste, aparte opruimstap.
--
-- VEILIGHEIDSGATE: voer dit UITSLUITEND uit nadat je hebt bevestigd dat
-- CONTACTS_SETUP.sql + CONTACTS_MIGRATE_DATA.sql zijn gedraaid, de nieuwe
-- Contacten-module in de app werkt, en je gemigreerde contacten (mét hun
-- tijdlijn) er goed uitzien. Dit verwijdert alle data van de oude
-- Outreach-module onomkeerbaar.
--
-- Volgorde van tabellen respecteert foreign keys (kinderen eerst).

drop table if exists outreach_flow_sends cascade;
drop table if exists outreach_gmail_tokens cascade;
drop table if exists outreach_flow_state cascade;
drop table if exists outreach_flow_steps cascade;
drop table if exists outreach_flows cascade;
drop table if exists outreach_sends cascade;
drop table if exists outreach_templates cascade;
drop table if exists outreach_emails cascade;
drop table if exists outreach_prospects cascade;
drop table if exists pipeline_tasks cascade;

alter table company_settings drop column if exists outreach_daily_send_limit;
alter table company_settings drop column if exists outreach_throttle_seconds;

-- Storage-bucket voor afbeeldingen in flow-mailteksten (OUTREACH_FLOW_CANVAS_SETUP.sql).
-- Supabase blokkeert directe deletes op storage.objects/storage.buckets via
-- SQL (protect_delete-trigger) — verwijder de bucket "outreach-images"
-- handmatig via Dashboard → Storage, dit script raakt 'm niet meer aan.
