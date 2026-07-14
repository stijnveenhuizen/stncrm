-- Contact-centrische architectuur — fase 1: nieuwe tabellen.
-- Voer dit uit vóór CONTACTS_MIGRATE_DATA.sql. Zelfde RLS-conventie als de rest
-- van het schema: is_member_of(organization_id), zie WORKSPACES_SETUP.sql.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. CONTACTS — de nieuwe basis-entiteit (vervangt outreach_prospects,
--    en is voortaan de bron van waarheid voor bedrijfsgegevens die tot nu
--    toe rechtstreeks op "pipeline" stonden).
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  company text,
  contact_name text, -- de contactpersoon bij het bedrijf (bv. "Jan de Vries") — apart van company, nodig voor de Pipeline-kaart ("Contactpersoon")
  email text,
  phone text,
  website text,
  website_domain text,
  city text,
  sector text,
  tags text[] not null default '{}',
  status text not null default 'NEW'
    check (status in ('NEW','CONTACTED','OPENED','CLICKED','REPLIED','CALL_SCHEDULED','MEETING','QUALIFIED','CUSTOMER','ARCHIVED')),
  leadscore int not null default 0,
  owner uuid references profiles(id),
  notes text,
  last_activity_at timestamptz not null default now(),
  source text, -- 'mailmeteor' | 'handmatig' | 'migratie-outreach' | 'migratie-pipeline'
  -- Tijdelijke bridge-kolommen, alleen voor de eenmalige backfill in
  -- CONTACTS_MIGRATE_DATA.sql — worden aan het eind van dat script gedropt.
  source_pipeline_id uuid,
  source_outreach_prospect_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Voorkomt duplicaten bij herhaalde webhook-inserts van hetzelfde e-mailadres.
-- Bewust GEEN "where email is not null" (partial index breekt ON CONFLICT bij
-- Supabase's upsert(), zie OUTREACH_FIX_INDEX.sql voor precedent) — gewone
-- unique index behandelt NULL al als geen-duplicaat.
create unique index if not exists contacts_org_email_idx on contacts(organization_id, email);
create index if not exists contacts_org_idx on contacts(organization_id);
create index if not exists contacts_status_idx on contacts(organization_id, status);
alter table contacts enable row level security;
drop policy if exists "org member access" on contacts;
create policy "org member access" on contacts for all
  using (is_member_of(organization_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 2. CONTACT_ACTIVITIES — de Contact-tijdlijn. Apart van de bestaande
--    prospect_activities (Deal-tijdlijn, blijft ongewijzigd bestaan).
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists contact_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  type text not null, -- EMAIL_SENT/EMAIL_OPENED/EMAIL_CLICKED/EMAIL_REPLIED/EMAIL_BOUNCED/UNSUBSCRIBED/
                       -- NOTE/CALL/MEETING/TASK_CREATED/TASK_COMPLETED/DEAL_CREATED/STATUS_CHANGED/
                       -- CONTACT_CREATED/UNKNOWN:<ruwe-event-naam>
  title text not null,
  description text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists contact_activities_contact_idx on contact_activities(contact_id, created_at desc);
alter table contact_activities enable row level security;
drop policy if exists "org member access" on contact_activities;
create policy "org member access" on contact_activities for all
  using (exists (select 1 from contacts c where c.id = contact_activities.contact_id and is_member_of(c.organization_id)));

-- last_activity_at op contacts bijhouden bij elke nieuwe activiteit — zelfde
-- patroon als touch_prospect_on_activity (PIPELINE_EXTRA_SETUP.sql).
create or replace function touch_contact_last_activity() returns trigger as $$
begin
  update contacts set last_activity_at = now() where id = new.contact_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_contact_last_activity on contact_activities;
create trigger trg_touch_contact_last_activity after insert on contact_activities
  for each row execute function touch_contact_last_activity();

-- ═══════════════════════════════════════════════════════════════════════
-- 3. CONTACT_TASKS — vervangt pipeline_tasks. Los van het bestaande
--    project-tasks-systeem (tabel "tasks"), dat ongewijzigd blijft.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists contact_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  deal_id uuid references pipeline(id) on delete set null,
  title text not null,
  description text,
  type text,
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  priority text not null default 'normaal',
  deadline date,
  owner uuid references profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists contact_tasks_contact_idx on contact_tasks(contact_id);
create index if not exists contact_tasks_org_open_idx on contact_tasks(organization_id, deadline) where status in ('open','in_progress');
alter table contact_tasks enable row level security;
drop policy if exists "org member access" on contact_tasks;
create policy "org member access" on contact_tasks for all
  using (is_member_of(organization_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 4. LEADSCORE_RULES — configureerbaar, niet hardcoded.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists leadscore_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  event_type text not null,
  points int not null default 0,
  is_active boolean not null default true,
  unique (organization_id, event_type)
);
alter table leadscore_rules enable row level security;
drop policy if exists "org member access" on leadscore_rules;
create policy "org member access" on leadscore_rules for all
  using (is_member_of(organization_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 5. AUTOMATION_RULES — rules engine (generaliseert pipeline_automations).
--    Puur workflow-acties (status + taak). Leadscore-punten lopen bewust
--    uitsluitend via leadscore_rules hierboven, zodat er niet twee plekken
--    zijn die punten voor hetzelfde event kunnen toekennen (dubbel tellen).
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null default 'Automatisering',
  trigger_type text not null check (trigger_type in ('event','inactivity')),
  trigger_event text,       -- canonical event, alleen bij trigger_type='event'
  inactivity_days int,      -- alleen bij trigger_type='inactivity'
  action_set_status text,
  action_create_task_title text,
  action_create_task_due_days int,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table automation_rules enable row level security;
drop policy if exists "org member access" on automation_rules;
create policy "org member access" on automation_rules for all
  using (is_member_of(organization_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 6. EVENT_TYPE_ALIASES — mapping van ruwe Zapier/Mailmeteor-veldnamen naar
--    canonieke events. Onbekende inkomende events worden nooit stilzwijgend
--    weggegooid (zie api/webhooks.js), maar wél als UNKNOWN:<key> gelogd
--    zodat je ze hier alsnog kan mappen.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists event_type_aliases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  external_key text not null,
  canonical_event text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, external_key)
);
alter table event_type_aliases enable row level security;
drop policy if exists "org member access" on event_type_aliases;
create policy "org member access" on event_type_aliases for all
  using (is_member_of(organization_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 7. WEBHOOK_ENDPOINTS — per-organisatie secret (i.p.v. één globale env var
--    zoals de oude Gmail-Pub/Sub-aanpak). service-role + org-eigen leesrecht.
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source text not null default 'mailmeteor',
  secret text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, source)
);
alter table webhook_endpoints enable row level security;
drop policy if exists "org member access" on webhook_endpoints;
create policy "org member access" on webhook_endpoints for all
  using (is_member_of(organization_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Wijzigingen op bestaande tabellen
-- ═══════════════════════════════════════════════════════════════════════
alter table pipeline add column if not exists contact_id uuid references contacts(id);
alter table clients add column if not exists contact_id uuid references contacts(id);

-- ═══════════════════════════════════════════════════════════════════════
-- 9. Seed: leadscore-defaults + webhook-secret per bestaande organisatie.
--    pgcrypto's gen_random_bytes is al beschikbaar (gen_random_uuid() gebruikt
--    hetzelfde extension-pad in dit project).
-- ═══════════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

do $$
declare
  org record;
begin
  for org in select id from organizations loop
    insert into leadscore_rules (organization_id, event_type, points) values
      (org.id, 'EMAIL_OPENED', 5),
      (org.id, 'EMAIL_CLICKED', 20),
      (org.id, 'EMAIL_REPLIED', 40),
      (org.id, 'CALL_COMPLETED', 25),
      (org.id, 'MEETING_BOOKED', 70)
    on conflict (organization_id, event_type) do nothing;

    -- Voorbeeldregels uit de spec, als data i.p.v. hardcoded if/else. Geen unique
    -- constraint op (organization_id, name) — toekomstige regels mogen best
    -- dezelfde naam/trigger delen — dus idempotentie hier via "where not exists".
    insert into automation_rules (organization_id, name, trigger_type, trigger_event, action_set_status, action_create_task_title, action_create_task_due_days)
    select org.id, 'Klik → bellen', 'event', 'EMAIL_CLICKED', 'CLICKED', 'Bel prospect', 1
    where not exists (select 1 from automation_rules where organization_id = org.id and name = 'Klik → bellen');

    insert into automation_rules (organization_id, name, trigger_type, trigger_event, action_set_status, action_create_task_title, action_create_task_due_days)
    select org.id, 'Reply → opvolgen', 'event', 'EMAIL_REPLIED', 'REPLIED', 'Reageer op prospect', 0
    where not exists (select 1 from automation_rules where organization_id = org.id and name = 'Reply → opvolgen');

    insert into automation_rules (organization_id, name, trigger_type, inactivity_days, action_create_task_title, action_create_task_due_days)
    select org.id, '7 dagen inactief → follow-up', 'inactivity', 7, 'Follow-up bellen', 0
    where not exists (select 1 from automation_rules where organization_id = org.id and name = '7 dagen inactief → follow-up');

    insert into webhook_endpoints (organization_id, source, secret)
    values (org.id, 'mailmeteor', encode(gen_random_bytes(24), 'hex'))
    on conflict (organization_id, source) do nothing;
  end loop;
end $$;
