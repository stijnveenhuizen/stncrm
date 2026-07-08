-- Voer dit uit NA alle eerdere SQL-bestanden.
--
-- Schema voor: uitgebreide tijdregistratie (uurtarief/facturatie/timer),
-- offerte-prijsblokken, klant-tevredenheid/reviews, en white-label instellingen.
-- "workspace" in de rest van de app = de bestaande "organizations"-tabel.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TIJDREGISTRATIE — uurtarief, facturatie, timer
-- ═══════════════════════════════════════════════════════════════════════════

alter table time_entries add column if not exists hourly_rate numeric;
alter table time_entries add column if not exists is_billable boolean not null default true;
alter table time_entries add column if not exists is_invoiced boolean not null default false;
alter table time_entries add column if not exists invoice_id uuid references invoices(id) on delete set null;
alter table time_entries add column if not exists started_at timestamptz;
alter table time_entries add column if not exists ended_at timestamptz;

-- Eén lopende timer per gebruiker tegelijk (ended_at is null zolang de timer loopt).
create unique index if not exists one_running_timer_per_user on time_entries(user_id) where ended_at is null;

-- Standaard-uurtarief op project/klant/werkruimte-niveau. Prioriteit bij het
-- bepalen van het tarief van een nieuwe tijdregistratie: project > klant > werkruimte.
alter table projects add column if not exists default_hourly_rate numeric;
alter table clients add column if not exists default_hourly_rate numeric;
alter table company_settings add column if not exists default_hourly_rate numeric;
-- (bestaande policies "user updates/deletes own time entries" dekken de timer-rijen ook)

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. OFFERTE CALCULATOR — herbruikbare prijsblokken
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists quote_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  price numeric not null default 0,
  category text not null default 'overig' check (category in ('website','design','hosting','onderhoud','marketing','overig')),
  is_optional boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz default now()
);
alter table quote_templates enable row level security;

drop policy if exists "org member manages quote templates" on quote_templates;
create policy "org member manages quote templates" on quote_templates for all
  using (is_member_of(organization_id));

alter table quotes add column if not exists quote_template_ids uuid[] not null default '{}';
alter table quotes add column if not exists discount_percentage numeric;
alter table quotes add column if not exists discount_amount numeric;
alter table quotes add column if not exists payment_terms text;
alter table quotes add column if not exists show_hourly_breakdown boolean not null default false;
alter table quotes add column if not exists rejection_reason text;

-- Bugfix: de check-constraint op quotes.status kende 'concept' nooit toe, terwijl
-- db.createProspectQuote() al langer status:'concept' invoegt voor prospect-offertes.
do $$
declare con record;
begin
  for con in select conname from pg_constraint where conrelid = 'quotes'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table quotes drop constraint %I', con.conname);
  end loop;
end $$;
alter table quotes add constraint quotes_status_check
  check (status in ('concept','verzonden','geaccepteerd','afgewezen','verlopen'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. KLANT-TEVREDENHEID — reviews/testimonials
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists client_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  score int check (score between 1 and 5),
  review_text text,
  is_public boolean not null default false,
  submitted_at timestamptz,
  request_sent_at timestamptz,
  created_at timestamptz default now()
);
alter table client_reviews enable row level security;

drop policy if exists "org member manages reviews" on client_reviews;
create policy "org member manages reviews" on client_reviews for all
  using (is_member_of(organization_id));

drop policy if exists "client reads own reviews" on client_reviews;
create policy "client reads own reviews" on client_reviews for select
  using (exists (select 1 from clients c where c.id = client_reviews.client_id and c.auth_user_id = auth.uid()));

drop policy if exists "client submits own review" on client_reviews;
create policy "client submits own review" on client_reviews for update
  using (exists (select 1 from clients c where c.id = client_reviews.client_id and c.auth_user_id = auth.uid()));

-- Publieke testimonial-widget (embed) leest publieke reviews zonder login, alleen
-- de velden die de widget nodig heeft (via een view i.p.v. de tabel zelf, zodat er
-- nooit per ongeluk niet-publieke reviews of interne kolommen worden blootgesteld).
create or replace view public_testimonials as
  select cr.id, cr.organization_id, cr.score, cr.review_text, cr.submitted_at,
         c.fname, c.lname, c.company
  from client_reviews cr join clients c on c.id = cr.client_id
  where cr.is_public = true and cr.review_text is not null;
grant select on public_testimonials to anon, authenticated;

-- Trigger voor het feedbackverzoek: 1 dag na het op "afgerond" zetten van een
-- project. Dit wordt client-side afgeleid (zelfde patroon als de bestaande
-- notificaties in Dashboard.jsx), dus alleen het tijdstip hoeft opgeslagen te worden.
alter table projects add column if not exists completed_at timestamptz;
alter table projects add column if not exists review_request_sent_at timestamptz;

create or replace function set_project_completed_at() returns trigger as $$
begin
  if new.status = 'afgerond' and (old.status is distinct from 'afgerond') then
    new.completed_at := now();
  elsif new.status <> 'afgerond' then
    new.completed_at := null;
    new.review_request_sent_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_project_completed_at on projects;
create trigger trg_project_completed_at before update on projects
  for each row execute function set_project_completed_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. WHITE-LABEL
-- ═══════════════════════════════════════════════════════════════════════════

alter table company_settings add column if not exists white_label_enabled boolean not null default false;
alter table company_settings add column if not exists brand_name text;
alter table company_settings add column if not exists brand_favicon_url text;
alter table company_settings add column if not exists custom_domain text;
alter table company_settings add column if not exists brand_support_email text;
alter table company_settings add column if not exists brand_footer_text text;
-- (logo_url en primary_color bestonden al in company_settings sinds FEATURE_PACK_SETUP.sql)
