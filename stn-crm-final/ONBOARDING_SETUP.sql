-- Voer dit uit NA alle eerdere SQL-bestanden van vandaag.
--
-- Onboarding-wizard: voortgang per werkruimte, event-log per stap, en een
-- is_demo-vlag op de tabellen die de wizard met voorbeelddata vult.

-- ── 1. Voortgang op de werkruimte zelf ──────────────────────────────────────────
alter table organizations add column if not exists onboarding_completed boolean not null default false;
alter table organizations add column if not exists onboarding_skipped boolean not null default false;
alter table organizations add column if not exists onboarding_step text;

-- ── 2. Event-log per stap (viewed/completed/skipped) ────────────────────────────
create table if not exists onboarding_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid not null references organizations(id) on delete cascade,
  step text not null,
  action text not null check (action in ('viewed','completed','skipped')),
  created_at timestamptz default now()
);
alter table onboarding_events enable row level security;

drop policy if exists "owner manages own onboarding events" on onboarding_events;
create policy "owner manages own onboarding events" on onboarding_events for all
  using (is_member_of(workspace_id));

-- ── 3. is_demo-vlag op alle tabellen die de wizard vult ─────────────────────────
alter table clients add column if not exists is_demo boolean not null default false;
alter table projects add column if not exists is_demo boolean not null default false;
alter table tasks add column if not exists is_demo boolean not null default false;
alter table invoices add column if not exists is_demo boolean not null default false;
alter table hosting add column if not exists is_demo boolean not null default false;
alter table pipeline add column if not exists is_demo boolean not null default false;
