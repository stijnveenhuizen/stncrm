-- VOORSTEL — nog niet uitgevoerd. Voer pas uit in de Supabase SQL Editor na
-- akkoord. Volgt hetzelfde patroon als de Pipeline-tabellen: organization_id
-- + is_member_of() voor RLS (helper uit WORKSPACES_SETUP.sql).

-- ═══════════════════════════════════════════════════════════════════════
-- 1. PROSPECTS — resultaten uit Google Places
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists outreach_prospects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text,
  sector text,
  website text,
  website_domain text,              -- genormaliseerd: lowercase, geen www./http(s)/trailing slash
  phone text,
  place_id text,                    -- Google Places ID — voorkomt dubbele inserts bij herhaalde zoekopdrachten
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  -- Gezet bij insert door de duplicaatcheck (zie Deel 4). Niet live herberekend
  -- bij elke render, dus de UI-waarschuwing werkt ook nog als de andere rij
  -- ondertussen is aangepast.
  duplicate_prospect_id uuid references outreach_prospects(id),
  duplicate_pipeline_id uuid references pipeline(id),
  created_at timestamptz not null default now()
);
create index if not exists outreach_prospects_org_idx on outreach_prospects(organization_id);
create unique index if not exists outreach_prospects_org_place_idx
  on outreach_prospects(organization_id, place_id) where place_id is not null;
alter table outreach_prospects enable row level security;
drop policy if exists "org members access outreach_prospects" on outreach_prospects;
create policy "org members access outreach_prospects" on outreach_prospects
  using (is_member_of(organization_id)) with check (is_member_of(organization_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 2. E-MAILS — gevonden op de website van een prospect
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists outreach_emails (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references outreach_prospects(id) on delete cascade,
  email text not null,
  confidence text not null check (confidence in ('found','guess','missing')),
  source text,                      -- bv. "contactpagina" of "patroon: info@domein"
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  checked_at timestamptz default now(),
  created_at timestamptz not null default now()
);
create index if not exists outreach_emails_prospect_idx on outreach_emails(prospect_id);
alter table outreach_emails enable row level security;
drop policy if exists "org members access outreach_emails" on outreach_emails;
create policy "org members access outreach_emails" on outreach_emails
  using (exists (
    select 1 from outreach_prospects p
    where p.id = outreach_emails.prospect_id and is_member_of(p.organization_id)
  ));

-- ═══════════════════════════════════════════════════════════════════════
-- 3. SECTOR-SJABLONEN — door jou beheerd, geen hardcoded teksten
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists outreach_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  sector text not null,
  subject text not null,
  body text not null,               -- placeholders: {bedrijfsnaam} {plaats} {sector}
  follow_up_subject text,
  follow_up_body text,
  follow_up_wait_days int not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists outreach_templates_org_sector_idx
  on outreach_templates(organization_id, lower(sector));
alter table outreach_templates enable row level security;
drop policy if exists "org members access outreach_templates" on outreach_templates;
create policy "org members access outreach_templates" on outreach_templates
  using (is_member_of(organization_id)) with check (is_member_of(organization_id));

-- ═══════════════════════════════════════════════════════════════════════
-- 4. VERZENDINGEN — 1 rij per prospect-mail, incl. de ene follow-up
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists outreach_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  prospect_id uuid not null references outreach_prospects(id) on delete cascade,
  email_id uuid not null references outreach_emails(id),
  template_id uuid not null references outreach_templates(id),
  -- Snapshot bij verzending — latere sjabloonwijzigingen raken deze rij niet met terugwerkende kracht.
  subject text not null,
  body text not null,
  follow_up_subject text,
  follow_up_body text,
  follow_up_wait_days int not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','sent','followed_up','replied','cancelled')),
  send_at timestamptz not null,          -- moment na het 60s-annuleervenster
  sent_at timestamptz,
  postmark_message_id text,
  follow_up_scheduled_at timestamptz,
  follow_up_sent_at timestamptz,
  follow_up_postmark_message_id text,
  replied_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists outreach_sends_org_idx on outreach_sends(organization_id);
create index if not exists outreach_sends_followup_due_idx
  on outreach_sends(follow_up_scheduled_at) where status = 'sent';
alter table outreach_sends enable row level security;
drop policy if exists "org members access outreach_sends" on outreach_sends;
create policy "org members access outreach_sends" on outreach_sends
  using (is_member_of(organization_id)) with check (is_member_of(organization_id));
