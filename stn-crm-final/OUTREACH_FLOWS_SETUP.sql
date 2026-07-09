-- VOORSTEL — nog niet uitgevoerd. Bouwt voort op OUTREACH_SETUP.sql (moet al
-- gedraaid zijn). Zelfde patroon: organization_id + is_member_of() voor RLS.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. FLOWS — los van sector, los van outreach_templates
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists outreach_flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table outreach_flows enable row level security;
drop policy if exists "org members access outreach_flows" on outreach_flows;
create policy "org members access outreach_flows" on outreach_flows
  using (is_member_of(organization_id)) with check (is_member_of(organization_id));

create table if not exists outreach_flow_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references outreach_flows(id) on delete cascade,
  step_order int not null check (step_order between 1 and 5),
  subject text not null,
  body text not null,                          -- vrije tekst, placeholders {bedrijfsnaam}/{plaats}/{sector}
  wait_days_after_previous int not null default 0 check (wait_days_after_previous >= 0),
  unique (flow_id, step_order)
);
alter table outreach_flow_steps enable row level security;
drop policy if exists "org members access outreach_flow_steps" on outreach_flow_steps;
create policy "org members access outreach_flow_steps" on outreach_flow_steps
  using (exists (select 1 from outreach_flows f where f.id = outreach_flow_steps.flow_id and is_member_of(f.organization_id)));

-- ═══════════════════════════════════════════════════════════════════════
-- 2. FLOW-TOEWIJZING PER PROSPECT — huidige stap + status
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists outreach_flow_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  prospect_id uuid not null references outreach_prospects(id) on delete cascade,
  flow_id uuid not null references outreach_flows(id),
  email_id uuid not null references outreach_emails(id),
  current_step int not null default 1,
  status text not null default 'scheduled'
    check (status in ('scheduled','queued','sent','replied','stopped','completed')),
  -- 'scheduled'  = wacht op wachttijd EN/OF jouw goedkeuring (stap 1: direct klaar)
  -- 'queued'     = door jou goedgekeurd, wacht alleen nog op dagelijkse verzendruimte
  -- 'sent'       = laatste stap is verstuurd, geen volgende stap meer
  -- 'completed'  = alle stappen doorlopen zonder reply
  scheduled_send_at timestamptz not null default now(),
  last_sent_at timestamptz,
  gmail_thread_id text,                        -- voor follow-ups in dezelfde e-mailthread + reply-matching
  stopped_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prospect_id, flow_id)
);
create index if not exists outreach_flow_state_org_idx on outreach_flow_state(organization_id);
create index if not exists outreach_flow_state_due_idx on outreach_flow_state(scheduled_send_at) where status = 'scheduled';
create index if not exists outreach_flow_state_thread_idx on outreach_flow_state(gmail_thread_id) where gmail_thread_id is not null;
alter table outreach_flow_state enable row level security;
drop policy if exists "org members access outreach_flow_state" on outreach_flow_state;
create policy "org members access outreach_flow_state" on outreach_flow_state
  using (is_member_of(organization_id)) with check (is_member_of(organization_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 3. GMAIL OAUTH-TOKENS — service-role only, GEEN RLS-policies (zelfde
--    aanpak als impersonation_log: de browser (anon/authenticated key) kan
--    deze tabel nooit rechtstreeks lezen/schrijven, alleen de serverless
--    functions met de service-role key).
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists outreach_gmail_tokens (
  organization_id uuid primary key references organizations(id) on delete cascade,
  gmail_email text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  last_history_id text,                        -- voor Gmail history.list — waar we gebleven waren
  watch_expires_at timestamptz,                -- Gmail watch() moet elke 7 dagen vernieuwd worden
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table outreach_gmail_tokens enable row level security;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Dagelijks verzendmaximum — hergebruikt company_settings i.p.v. een
--    aparte tabel voor één instelling.
-- ═══════════════════════════════════════════════════════════════════════
alter table company_settings add column if not exists outreach_daily_send_limit int not null default 30;
