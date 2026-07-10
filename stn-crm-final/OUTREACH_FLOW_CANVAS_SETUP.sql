-- VOORSTEL — nog niet uitgevoerd. Bouwt voort op OUTREACH_FLOWS_SETUP.sql +
-- OUTREACH_FLOW_CONDITIONS_SETUP.sql (moeten al gedraaid zijn).

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Canvas-positie per stap — puur cosmetisch (waar de kaart op het
--    sleep-canvas staat). step_order + de condition-kolommen blijven de
--    bron van waarheid voor het daadwerkelijke flow-gedrag; dit is alleen
--    voor de vrije-plaatsing-UI. Nullable: ontbrekende positie = de UI
--    kiest zelf een startpositie (nieuwe stap, of oude flow van vóór deze
--    migratie).
-- ═══════════════════════════════════════════════════════════════════════
alter table outreach_flow_steps add column if not exists canvas_x double precision;
alter table outreach_flow_steps add column if not exists canvas_y double precision;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Opslag voor afbeeldingen die in flow-mailteksten worden ingevoegd.
--    Publiek leesbaar (nodig: Gmail/andere mailclients moeten de afbeelding
--    over het publieke internet kunnen ophalen), alleen orgleden mogen
--    uploaden — zelfde patroon als company-logos in FEATURE_PACK_SETUP.sql.
-- ═══════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('outreach-images', 'outreach-images', true)
on conflict (id) do nothing;

drop policy if exists "org members upload outreach images" on storage.objects;
create policy "org members upload outreach images" on storage.objects for insert
  with check (bucket_id = 'outreach-images' and is_member_of((storage.foldername(name))[1]::uuid));

drop policy if exists "anyone reads outreach images" on storage.objects;
create policy "anyone reads outreach images" on storage.objects for select
  using (bucket_id = 'outreach-images');

-- Let op: vanaf nu bevat outreach_flow_steps.body rijke HTML (opgemaakt via
-- de nieuwe editor) i.p.v. platte tekst. Geen kolom-/typewijziging nodig
-- (blijft "text"), en bestaande platte-tekst-stappen blijven gewoon werken
-- (platte tekst is ook geldige HTML — geen tags om te breken).
