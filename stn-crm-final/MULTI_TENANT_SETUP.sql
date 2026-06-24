-- Voer dit uit in de Supabase SQL Editor, NA SUPABASE_SETUP.sql en CLIENT_PORTAL_SETUP.sql.
--
-- Voegt organisaties (multi-tenant) toe: elk bedrijf krijgt een eigen afgeschermde
-- werkruimte, met een eigenaar die collega's uitnodigt en klanten aan hen toewijst.
--
-- Ontwerpkeuze: alleen `clients` en `pipeline` krijgen een eigen `organization_id`-kolom.
-- Alle andere tabellen (projects, tasks, invoices, recurring, notes, hosting, meetings,
-- pipeline_tasks) hangen al via client_id/project_id/prospect_id aan een klant of lead,
-- en de policies hieronder lezen de organisatie dáár vandaan. Dat voorkomt dat elke
-- create-functie in db.js aangepast moet worden om organization_id mee te geven, en
-- voorkomt dat die kolommen ooit los kunnen gaan lopen van de echte eigenaar (clients/pipeline).

-- ── 1. Organisaties ──────────────────────────────────────────────────────────────
-- (Nog geen policies hier — die verwijzen naar profiles.organization_id, en die
-- kolom bestaat pas na stap 2. Eerst de tabel, policies volgen na stap 2.)
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);
alter table organizations enable row level security;

-- ── 2. Profiles: organisatie + rol ───────────────────────────────────────────────
alter table profiles add column if not exists organization_id uuid references organizations(id);
alter table profiles add column if not exists role text not null default 'member';

alter table profiles enable row level security;

-- Nu profiles.organization_id bestaat, kunnen de organizations-policies erbij.
drop policy if exists "view own organization" on organizations;
create policy "view own organization" on organizations for select
  using (id = (select organization_id from profiles where id = auth.uid()));

drop policy if exists "create organization" on organizations;
create policy "create organization" on organizations for insert
  with check (true);

drop policy if exists "view own profile" on profiles;
create policy "view own profile" on profiles for select
  using (id = auth.uid());

drop policy if exists "view org colleagues" on profiles;
create policy "view org colleagues" on profiles for select
  using (organization_id = (select organization_id from profiles p2 where p2.id = auth.uid()));

-- Bootstrap: je mag jezelf als 'owner' aanmaken, maar uitsluitend voor een organisatie
-- die nog NIEMAND als profiel heeft (dus net door jou aangemaakt) — voorkomt dat iemand
-- zichzelf 'owner' maakt van een bestaand, al bezet bedrijf.
drop policy if exists "bootstrap organization owner" on profiles;
create policy "bootstrap organization owner" on profiles for insert
  with check (
    id = auth.uid() and role = 'owner'
    and not exists (select 1 from profiles p2 where p2.organization_id = profiles.organization_id)
  );

-- Teamlid-uitnodiging: alleen toegestaan als de organisatie-claim overeenkomt met de
-- JWT user_metadata die bij het versturen van de uitnodiging is gezet (server-side
-- verifieerbaar, niet client-input) — zelfde patroon als de klant-self-link hieronder.
drop policy if exists "self-link invited team member" on profiles;
create policy "self-link invited team member" on profiles for insert
  with check (
    id = auth.uid() and role = 'member'
    and organization_id::text = (auth.jwt() -> 'user_metadata' ->> 'invite_organization_id')
  );

-- Alleen de "veilige" velden zijn update-baar; organization_id/role kunnen NOOIT via een
-- update worden gewijzigd (voorkomt dat een teamlid zichzelf tot eigenaar promoveert).
drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
revoke update on profiles from authenticated;
grant update (full_name, theme, accent_color, avatar_url, updated_at) on profiles to authenticated;

-- ── 3. Tenant-kolom + toewijzing op clients, tenant-kolom op pipeline ───────────
alter table clients add column if not exists organization_id uuid references organizations(id);
alter table clients add column if not exists assigned_to uuid references profiles(id);
alter table pipeline add column if not exists organization_id uuid references organizations(id);

-- Triggers: vullen organization_id automatisch met de organisatie van de inlogger,
-- zodat createClient()/createProspect() in db.js niet aangepast hoeven te worden.
create or replace function set_organization_from_profile() returns trigger as $$
begin
  if new.organization_id is null then
    select organization_id into new.organization_id from profiles where id = auth.uid();
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_clients_set_org on clients;
create trigger trg_clients_set_org before insert on clients
  for each row execute function set_organization_from_profile();

drop trigger if exists trg_pipeline_set_org on pipeline;
create trigger trg_pipeline_set_org before insert on pipeline
  for each row execute function set_organization_from_profile();

-- ── 4. Backfill bestaande data (kritiek — anders verlies je toegang tot je eigen data) ──
-- Pakt de eerste bestaande profile-rij (jij, de huidige enige gebruiker), maakt daar één
-- organisatie voor, zet die rij op 'owner', en vult organization_id overal in. Als er
-- geen bestaand profiel is (verse installatie), gebeurt er niets — veilig in beide gevallen.
do $$
declare
  v_profile_id uuid;
  v_org_id uuid;
begin
  select id into v_profile_id from profiles where organization_id is null order by updated_at asc nulls last limit 1;
  if v_profile_id is not null then
    insert into organizations (name) values ('Mijn bedrijf') returning id into v_org_id;
    update profiles set organization_id = v_org_id, role = 'owner' where id = v_profile_id;
    update profiles set organization_id = v_org_id where organization_id is null;
    update clients set organization_id = v_org_id where organization_id is null;
    update pipeline set organization_id = v_org_id where organization_id is null;
  end if;
end $$;

alter table clients alter column organization_id set not null;
alter table pipeline alter column organization_id set not null;

-- ── 5. RLS: organisatie- en toewijzingsbewuste toegang voor staff ───────────────
-- Patroon: binnen je eigen organisatie zie je alles dat niet aan een ANDERE collega is
-- toegewezen. Eigenaar ('owner') ziet altijd alles, ongeacht toewijzing.

drop policy if exists "staff full access" on clients;
create policy "org member access" on clients for all
  using (
    exists (
      select 1 from profiles pr
      where pr.id = auth.uid() and pr.organization_id = clients.organization_id
        and (pr.role = 'owner' or clients.assigned_to = auth.uid() or clients.assigned_to is null)
    )
  );

drop policy if exists "staff full access" on projects;
create policy "org member access" on projects for all
  using (
    exists (
      select 1 from profiles pr join clients c on c.organization_id = pr.organization_id
      where pr.id = auth.uid() and c.id = projects.client_id
        and (pr.role = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "staff full access" on tasks;
create policy "org member access" on tasks for all
  using (
    exists (
      select 1 from profiles pr
      join projects p on p.id = tasks.project_id
      join clients c on c.id = p.client_id
      where pr.id = auth.uid() and c.organization_id = pr.organization_id
        and (pr.role = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "staff full access" on invoices;
create policy "org member access" on invoices for all
  using (
    exists (
      select 1 from profiles pr join clients c on c.organization_id = pr.organization_id
      where pr.id = auth.uid() and c.id = invoices.client_id
        and (pr.role = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "staff full access" on recurring;
create policy "org member access" on recurring for all
  using (
    exists (
      select 1 from profiles pr join clients c on c.organization_id = pr.organization_id
      where pr.id = auth.uid() and c.id = recurring.client_id
        and (pr.role = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "staff full access" on notes;
create policy "org member access" on notes for all
  using (
    exists (
      select 1 from profiles pr join clients c on c.organization_id = pr.organization_id
      where pr.id = auth.uid() and c.id = notes.client_id
        and (pr.role = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "staff full access" on hosting;
create policy "org member access" on hosting for all
  using (
    exists (
      select 1 from profiles pr join clients c on c.organization_id = pr.organization_id
      where pr.id = auth.uid() and c.id = hosting.client_id
        and (pr.role = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

drop policy if exists "staff full access" on meetings;
create policy "org member access" on meetings for all
  using (
    exists (
      select 1 from profiles pr join clients c on c.organization_id = pr.organization_id
      where pr.id = auth.uid() and c.id = meetings.client_id
        and (pr.role = 'owner' or c.assigned_to = auth.uid() or c.assigned_to is null)
    )
  );

-- Pipeline (leads): alleen organisatie-scoping, bewust geen toewijzing (gevraagd voor
-- klanten, niet voor leads).
alter table pipeline enable row level security;
drop policy if exists "org member access" on pipeline;
create policy "org member access" on pipeline for all
  using (
    exists (
      select 1 from profiles pr
      where pr.id = auth.uid() and pr.organization_id = pipeline.organization_id
    )
  );

alter table pipeline_tasks enable row level security;
drop policy if exists "org member access" on pipeline_tasks;
create policy "org member access" on pipeline_tasks for all
  using (
    exists (
      select 1 from profiles pr
      join pipeline pl on pl.id = pipeline_tasks.prospect_id
      where pr.id = auth.uid() and pl.organization_id = pr.organization_id
    )
  );

-- De klant-kant policies uit CLIENT_PORTAL_SETUP.sql ("client read own ...",
-- "client self-link", etc.) blijven ongewijzigd — die zijn al scherp op het eigen
-- client_id van de klant gescoped en hebben geen organisatie-besef nodig.
