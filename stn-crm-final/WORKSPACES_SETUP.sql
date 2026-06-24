-- Voer dit uit NA MULTI_TENANT_SETUP.sql, FIX_PROFILES_RECURSION.sql en TEAM_ROLES_SETUP.sql.
--
-- Maakt "1 account = 1 organisatie" los: een account kan nu lid zijn van meerdere
-- organisaties (werkruimtes) via een nieuwe `memberships`-tabel, met een rol per
-- organisatie (niet meer één rol per account).
--
-- BELANGRIJK ONTWERPPRINCIPE: autorisatie (mag je deze org zien) wordt uitsluitend
-- bepaald door een echte rij in `memberships` — nooit door een door de klant zelf
-- instelbare waarde (zoals een JWT user_metadata claim of localStorage). "Welke
-- werkruimte is nu actief" is puur een client-side UI-keuze die bepaalt wélke van je
-- ECHTE memberships je opvraagt, nooit wat je mag opvragen.

-- ── 1. Memberships ──────────────────────────────────────────────────────────────
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  organization_id uuid not null references organizations(id),
  role text not null default 'member',
  created_at timestamptz default now(),
  unique(user_id, organization_id)
);
alter table memberships enable row level security;

create or replace function is_member_of(org_id uuid) returns boolean as $$
  select exists (select 1 from memberships where user_id = auth.uid() and organization_id = org_id);
$$ language sql security definer stable set search_path = public;

create or replace function role_in(org_id uuid) returns text as $$
  select role from memberships where user_id = auth.uid() and organization_id = org_id;
$$ language sql security definer stable set search_path = public;

-- Backfill: zet elk bestaand account-organisatie-paar om in een membership-rij.
insert into memberships (user_id, organization_id, role)
select id, organization_id, role from profiles where organization_id is not null
on conflict (user_id, organization_id) do nothing;

-- ── 2. Oude profiles-policies weg (verwezen naar organization_id/role, die hierna
--    van profiles verdwijnen) en organizations-policy omzetten naar memberships ──
drop policy if exists "view org colleagues" on profiles;
drop policy if exists "bootstrap organization owner" on profiles;
drop policy if exists "self-link invited team member" on profiles;
drop policy if exists "owner manages team roles" on profiles;
drop policy if exists "update own profile" on profiles;
revoke update on profiles from authenticated; -- herstel: profiles heeft straks geen gevoelige kolommen meer, dus geen kolom-restrictie meer nodig

-- Moet weg vóór de kolommen zelf verdwijnen (de functie leest old.role/old.organization_id
-- en zou anders bij de volgende profiel-update op een niet-bestaande kolom stuklopen).
drop trigger if exists trg_prevent_orphan_org on profiles;

drop policy if exists "view own organization" on organizations;
create policy "view own organization" on organizations for select
  using (is_member_of(id));

-- ── 3. Nieuwe, simpele profiles-policies (alleen nog persoonlijke voorkeuren) ───
drop policy if exists "view own profile" on profiles;
create policy "view own profile" on profiles for select using (id = auth.uid());

create policy "view fellow members" on profiles for select
  using (exists (
    select 1 from memberships m1 join memberships m2 on m1.organization_id = m2.organization_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id
  ));

create policy "insert own profile" on profiles for insert with check (id = auth.uid());
create policy "update own profile" on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ── 4. (verplaatst naar het allerlaatst — zie onderaan dit bestand. De "org member
--    access"-policies op clients/projects/etc. verwijzen nog naar profiles.organization_id
--    en moeten eerst herschreven worden in stap 7, anders kan de kolom niet weg.)

-- ── 5. Memberships-policies + bescherming tegen een organisatie zonder eigenaar ─
create policy "view org memberships" on memberships for select
  using (is_member_of(organization_id));

create policy "bootstrap organization owner" on memberships for insert
  with check (
    user_id = auth.uid() and role = 'owner'
    and not exists (select 1 from memberships m2 where m2.organization_id = memberships.organization_id)
  );

create policy "self-link invited team member" on memberships for insert
  with check (
    user_id = auth.uid() and role = 'member'
    and organization_id::text = (auth.jwt() -> 'user_metadata' ->> 'invite_organization_id')
  );

create policy "owner manages team roles" on memberships for update
  using (user_id <> auth.uid() and role_in(organization_id) = 'owner')
  with check (user_id <> auth.uid() and is_member_of(organization_id));

create or replace function prevent_orphan_organization() returns trigger as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    if (select count(*) from memberships where organization_id = old.organization_id and role = 'owner') <= 1 then
      raise exception 'Een organisatie moet minstens één eigenaar hebben.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_orphan_org on memberships;
create trigger trg_prevent_orphan_org before update or delete on memberships
  for each row execute function prevent_orphan_organization();

-- ── 6. Auto-fill organization_id op clients/pipeline kan niet meer (een account kan
--    nu meerdere orgs hebben, er is geen "de" organisatie meer) — trigger weg, de
--    applicatie geeft organization_id voortaan altijd zelf expliciet mee bij insert.
drop trigger if exists trg_clients_set_org on clients;
drop trigger if exists trg_pipeline_set_org on pipeline;
drop function if exists set_organization_from_profile();

-- ── 7. Alle data-policies herschreven naar is_member_of()/role_in() ─────────────
drop policy if exists "org member access" on clients;
create policy "org member access" on clients for all
  using (
    is_member_of(organization_id)
    and (role_in(organization_id) = 'owner' or assigned_to = auth.uid() or assigned_to is null)
  );

drop policy if exists "org member access" on projects;
create policy "org member access" on projects for all
  using (
    exists (
      select 1 from clients c where c.id = projects.client_id and is_member_of(c.organization_id)
        and (role_in(c.organization_id) = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "org member access" on tasks;
create policy "org member access" on tasks for all
  using (
    exists (
      select 1 from projects p join clients c on c.id = p.client_id
      where p.id = tasks.project_id and is_member_of(c.organization_id)
        and (role_in(c.organization_id) = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "org member access" on invoices;
create policy "org member access" on invoices for all
  using (
    exists (
      select 1 from clients c where c.id = invoices.client_id and is_member_of(c.organization_id)
        and (role_in(c.organization_id) = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "org member access" on recurring;
create policy "org member access" on recurring for all
  using (
    exists (
      select 1 from clients c where c.id = recurring.client_id and is_member_of(c.organization_id)
        and (role_in(c.organization_id) = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "org member access" on notes;
create policy "org member access" on notes for all
  using (
    exists (
      select 1 from clients c where c.id = notes.client_id and is_member_of(c.organization_id)
        and (role_in(c.organization_id) = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "org member access" on hosting;
create policy "org member access" on hosting for all
  using (
    exists (
      select 1 from clients c where c.id = hosting.client_id and is_member_of(c.organization_id)
        and (role_in(c.organization_id) = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "org member access" on meetings;
create policy "org member access" on meetings for all
  using (
    exists (
      select 1 from clients c where c.id = meetings.client_id and is_member_of(c.organization_id)
        and (role_in(c.organization_id) = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "org member access" on pipeline;
create policy "org member access" on pipeline for all
  using (is_member_of(organization_id));

drop policy if exists "org member access" on pipeline_tasks;
create policy "org member access" on pipeline_tasks for all
  using (
    exists (select 1 from pipeline pl where pl.id = pipeline_tasks.prospect_id and is_member_of(pl.organization_id))
  );

-- De klant-kant policies uit CLIENT_PORTAL_SETUP.sql ("client read own ...", "client
-- self-link", etc.) blijven volledig ongewijzigd — die zijn al gescoped op het eigen
-- client_id van de klant en hebben geen organisatie-besef nodig.

-- ── 8. Nu pas, want alle policies die ernaar verwezen zijn hierboven al herschreven ─
alter table profiles drop column if exists organization_id;
alter table profiles drop column if exists role;
