-- Voer dit uit in de Supabase SQL Editor (supabase.com → jouw project → SQL Editor)
-- Vereist: SUPABASE_SETUP.sql is al uitgevoerd, en de tabellen `hosting`, `meetings`,
-- `profiles` bestaan al (aangemaakt via de Supabase dashboard / eerdere features).
--
-- Dit script voegt een klantenportaal toe: klanten loggen in via magic link en zien
-- (alleen) hun eigen project, taken, notities, meetings, facturen en hosting-info
-- (zonder hosting-inloggegevens).

-- ── 1. Koppeling klant-account ↔ klantrecord ────────────────────────────────────
alter table clients add column if not exists auth_user_id uuid references auth.users(id);

-- ── 2. Zichtbaarheid/herkomst op taken, notities, meetings ──────────────────────
alter table tasks add column if not exists visible_to_client boolean not null default false;
alter table tasks add column if not exists created_by text not null default 'staff';

alter table notes add column if not exists visible_to_client boolean not null default false;

alter table meetings add column if not exists visible_to_client boolean not null default true;

-- ── 3. View op hosting zonder inloggegevens (kolom-afscherming) ────────────────
-- BELANGRIJK: deze view heeft GEEN `security_invoker` — hij draait dus als de
-- eigenaar (bypassed de RLS van de onderliggende `hosting`-tabel) en filtert zelf
-- op de ingelogde klant via auth.uid(). Zo kan een klant nooit via `.from('hosting')`
-- direct de inloggegevens opvragen (daar krijgt hij door RLS gewoon 0 rijen op terug),
-- en via deze view nooit de credential-kolommen, want die staan er niet in.
create or replace view client_hosting as
select id, client_id, site_name, url, cms, hoster, domain, domain_expires, ssl_expires,
       monthly_cost, notes, created_at
from hosting
where client_id = (select id from clients where auth_user_id = auth.uid());

grant select on client_hosting to authenticated;

-- ── 4. RLS: vervang de "iedereen-die-is-ingelogd-ziet-alles" policies ──────────
-- Bestaande policies droppen (negeer fouten als een policy niet bestaat op een tabel)
drop policy if exists "auth users only" on clients;
drop policy if exists "auth users only" on projects;
drop policy if exists "auth users only" on tasks;
drop policy if exists "auth users only" on invoices;
drop policy if exists "auth users only" on recurring;
drop policy if exists "auth users only" on notes;
drop policy if exists "auth users only" on hosting;
drop policy if exists "auth users only" on meetings;

alter table hosting enable row level security;
alter table meetings enable row level security;

-- Staff (heeft een rij in profiles) houdt volledige toegang op alle tabellen.
create policy "staff full access" on clients for all
  using (exists (select 1 from profiles where profiles.id = auth.uid()));
create policy "staff full access" on projects for all
  using (exists (select 1 from profiles where profiles.id = auth.uid()));
create policy "staff full access" on tasks for all
  using (exists (select 1 from profiles where profiles.id = auth.uid()));
create policy "staff full access" on invoices for all
  using (exists (select 1 from profiles where profiles.id = auth.uid()));
create policy "staff full access" on recurring for all
  using (exists (select 1 from profiles where profiles.id = auth.uid()));
create policy "staff full access" on notes for all
  using (exists (select 1 from profiles where profiles.id = auth.uid()));
create policy "staff full access" on hosting for all
  using (exists (select 1 from profiles where profiles.id = auth.uid()));
create policy "staff full access" on meetings for all
  using (exists (select 1 from profiles where profiles.id = auth.uid()));

-- Klant: alleen het eigen klantrecord lezen, en zichzelf koppelen (eerste login).
create policy "client read own record" on clients for select
  using (auth_user_id = auth.uid());
create policy "client self-link" on clients for update
  using (auth_user_id is null and id::text = (auth.jwt() -> 'user_metadata' ->> 'portal_client_id'))
  with check (auth_user_id = auth.uid());

-- Klant: alleen eigen project(en).
create policy "client read own projects" on projects for select
  using (client_id = (select id from clients where auth_user_id = auth.uid()));

-- Klant: alleen client-visible taken van eigen project(en); mag zelf taken aanmaken
-- en aanvinken/wijzigen, maar alleen die welke al zichtbaar voor hem zijn.
create policy "client read own visible tasks" on tasks for select
  using (
    visible_to_client = true
    and exists (
      select 1 from projects p join clients c on c.id = p.client_id
      where p.id = tasks.project_id and c.auth_user_id = auth.uid()
    )
  );
create policy "client create own task" on tasks for insert
  with check (
    created_by = 'client' and visible_to_client = true
    and exists (
      select 1 from projects p join clients c on c.id = p.client_id
      where p.id = tasks.project_id and c.auth_user_id = auth.uid()
    )
  );
create policy "client update own visible task" on tasks for update
  using (
    visible_to_client = true
    and exists (
      select 1 from projects p join clients c on c.id = p.client_id
      where p.id = tasks.project_id and c.auth_user_id = auth.uid()
    )
  )
  with check (
    visible_to_client = true
    and exists (
      select 1 from projects p join clients c on c.id = p.client_id
      where p.id = tasks.project_id and c.auth_user_id = auth.uid()
    )
  );

-- Klant: alleen client-visible notities van zichzelf.
create policy "client read own visible notes" on notes for select
  using (
    visible_to_client = true
    and client_id = (select id from clients where auth_user_id = auth.uid())
  );

-- Klant: alleen client-visible meetings van zichzelf.
create policy "client read own visible meetings" on meetings for select
  using (
    visible_to_client = true
    and client_id = (select id from clients where auth_user_id = auth.uid())
  );

-- Klant: alleen eigen, verzonden/betaalde facturen (geen concepten).
create policy "client read own invoices" on invoices for select
  using (
    status <> 'concept'
    and client_id = (select id from clients where auth_user_id = auth.uid())
  );

-- Klant: alleen eigen recurring-overzicht (gebruikt voor MRR-weergave indien gewenst).
create policy "client read own recurring" on recurring for select
  using (client_id = (select id from clients where auth_user_id = auth.uid()));

-- Geen client-policy op `hosting` zelf: alleen staff mag die tabel rechtstreeks
-- benaderen. Klanten lezen uitsluitend via de `client_hosting` view hierboven,
-- die de eigen rij-filtering al regelt en geen credential-kolommen bevat.
