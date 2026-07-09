-- Bouwt voort op OUTREACH_FLOWS_SETUP.sql + OUTREACH_FLOW_CONDITIONS_SETUP.sql
-- (moeten al gedraaid zijn). Zelfde patroon: organization_id + is_member_of().

-- ═══════════════════════════════════════════════════════════════════════
-- Eén rij per daadwerkelijk verzonden flow-stap-mail. outreach_flow_state
-- blijft de "huidige stand" (1 rij per prospect+flow); deze tabel is de
-- historie die nodig is zodra een prospect meerdere stappen doorloopt en
-- elke stap zijn eigen open/klik/reply-status moet kunnen hebben. Is meteen
-- de bron voor de Insights-funnel en de individuele verzendlijst.
--
-- Scope-besluit (bevestigd): alleen mails verstuurd via de flow-engine
-- krijgen tracking. Oudere/losse verzendingen via outreach_sends (het
-- sjabloon-gebaseerde Postmark-pad) blijven ongewijzigd en tonen "—" bij
-- Geopend/Geklikt in de gecombineerde lijst.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists outreach_flow_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  flow_state_id uuid not null references outreach_flow_state(id) on delete cascade,
  flow_id uuid not null references outreach_flows(id),
  prospect_id uuid not null references outreach_prospects(id) on delete cascade,
  step_order int not null,
  subject text not null,
  sent_at timestamptz not null default now(),   -- stabiele periode-filter-kolom (i.p.v. flow_state.last_sent_at, die bij de volgende stap overschreven wordt)
  gmail_message_id text,
  tracking_token text not null,                 -- niet-raadbaar, staat in de pixel-/redirect-URL, is zelf de "auth" (geen apart secret nodig)
  opened_at timestamptz,
  open_count int not null default 0,
  clicked_at timestamptz,
  click_count int not null default 0,
  replied_at timestamptz,                        -- gezet door handleGmailPubSub als DEZE stap de reply ving
  unique (flow_state_id, step_order)
);
create index if not exists outreach_flow_sends_org_period_idx on outreach_flow_sends(organization_id, sent_at);
create index if not exists outreach_flow_sends_flow_idx on outreach_flow_sends(flow_id);
create unique index if not exists outreach_flow_sends_token_idx on outreach_flow_sends(tracking_token);
alter table outreach_flow_sends enable row level security;
drop policy if exists "org members access outreach_flow_sends" on outreach_flow_sends;
create policy "org members access outreach_flow_sends" on outreach_flow_sends
  using (is_member_of(organization_id)) with check (is_member_of(organization_id));
