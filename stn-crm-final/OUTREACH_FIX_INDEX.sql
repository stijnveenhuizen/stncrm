-- Eenmalige reparatie: de eerste versie van OUTREACH_SETUP.sql maakte een
-- PARTIAL unique index (met "where place_id is not null"), waar Postgres
-- geen ON CONFLICT tegen kan matchen via Supabase's upsert(). Dit vervangt
-- 'm door een gewone unique index — zelfde gedrag, wel bruikbaar als
-- ON CONFLICT-doelwit.
drop index if exists outreach_prospects_org_place_idx;
create unique index if not exists outreach_prospects_org_place_idx
  on outreach_prospects(organization_id, place_id);
