-- Voer dit uit NA alle eerdere SQL-bestanden, inclusief IMPERSONATION_LOG_SETUP.sql
-- en ONBOARDING_SETUP.sql (die bestonden al — dit bestand hergebruikt en breidt uit
-- i.p.v. te dupliceren).
--
-- Net als impersonation_log: GEEN RLS-policies op deze tabellen, dus de browser
-- (anon/authenticated key) kan ze nooit rechtstreeks lezen/schrijven — alleen de
-- serverless functions met de service-role key (zie api/_shared.js: requireAdmin).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. GEBRUIKSSTATISTIEKEN
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists admin_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references organizations(id) on delete set null,
  event_type text not null check (event_type in ('page_view','action','error','login','logout')),
  event_name text not null,
  metadata jsonb not null default '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table admin_events enable row level security;
create index if not exists admin_events_created_at_idx on admin_events(created_at desc);
create index if not exists admin_events_user_idx on admin_events(user_id);
create index if not exists admin_events_name_idx on admin_events(event_name);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. IMPERSONATIE — bestaande impersonation_log uitbreiden i.p.v. een tweede
--    tabel aanmaken (voorkomt dat impersonatie-historie over twee tabellen
--    versnippert).
-- ═══════════════════════════════════════════════════════════════════════════

alter table impersonation_log add column if not exists reason text;
alter table impersonation_log add column if not exists workspace_id uuid references organizations(id);
alter table impersonation_log add column if not exists ended_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ERROR LOGS
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists system_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references organizations(id) on delete set null,
  error_message text not null,
  error_stack text,
  route text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table system_errors enable row level security;
create index if not exists system_errors_created_at_idx on system_errors(created_at desc);
