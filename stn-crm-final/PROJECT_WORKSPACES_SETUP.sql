-- Voer dit uit NA alle eerdere SQL-bestanden van vandaag (laatste was
-- FIX_WORKSPACES_PERMISSIONS.sql).
--
-- Herdefinieert "werkruimte" op projectniveau: een project krijgt eigen
-- toegewezen collega's (meerdere) en eigen uitgenodigde klant-toegang (los van
-- elkaars projecten bij dezelfde klant), plus een docs-functie. Company-breed
-- (klanten, facturen, hosting, pipeline) blijft simpelweg "iedereen in de
-- organisatie ziet het" — dat is precies het verschil tussen de twee lagen.

-- ── 1. Project members (vervangt clients.assigned_to voor projectzichtbaarheid) ─
create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id),
  created_at timestamptz default now(),
  unique(project_id, user_id)
);
alter table project_members enable row level security;

-- ── 2. Project-scoped klanttoegang ───────────────────────────────────────────────
create table if not exists project_client_access (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  created_at timestamptz default now(),
  unique(project_id, client_id)
);
alter table project_client_access enable row level security;

-- ── 3. Project-documenten ───────────────────────────────────────────────────────
create table if not exists project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  uploaded_by uuid references profiles(id),
  file_name text not null,
  storage_path text not null,
  file_size bigint,
  visible_to_client boolean not null default false,
  created_at timestamptz default now()
);
alter table project_documents enable row level security;

insert into storage.buckets (id, name, public)
values ('project-docs', 'project-docs', false)
on conflict (id) do nothing;

-- ── 4. Helper: mag deze gebruiker dit project zien/beheren? ────────────────────
-- Eigenaar van de organisatie altijd; teamlid alleen als hij in project_members
-- staat. Security definer, anders recursie-risico zoals eerder vandaag.
create or replace function can_access_project(proj_id uuid) returns boolean as $$
  select exists (
    select 1 from projects p join clients c on c.id = p.client_id
    where p.id = proj_id
      and is_member_of(c.organization_id)
      and (
        role_in(c.organization_id) = 'owner'
        or exists (select 1 from project_members pm where pm.project_id = proj_id and pm.user_id = auth.uid())
      )
  );
$$ language sql security definer stable set search_path = public;

-- ── 5. Policies op de drie nieuwe tabellen ──────────────────────────────────────
create policy "see project team" on project_members for select
  using (can_access_project(project_id));
create policy "owner manages project team" on project_members for all
  using (
    exists (
      select 1 from projects p join clients c on c.id = p.client_id
      where p.id = project_members.project_id and role_in(c.organization_id) = 'owner'
    )
  );

create policy "staff manage project client access" on project_client_access for all
  using (can_access_project(project_id));
-- Klant zelf-koppeling bij een uitnodiging (zelfde JWT-claim-patroon als de
-- bestaande client- en team-self-link policies).
create policy "client self-grant via invite" on project_client_access for insert
  with check (
    project_id::text = (auth.jwt() -> 'user_metadata' ->> 'portal_project_id')
    and client_id = (select id from clients where auth_user_id = auth.uid())
  );

create policy "staff manage project documents" on project_documents for all
  using (can_access_project(project_id));
create policy "client read visible documents" on project_documents for select
  using (
    visible_to_client = true
    and exists (
      select 1 from project_client_access pca join clients c on c.id = pca.client_id
      where pca.project_id = project_documents.project_id and c.auth_user_id = auth.uid()
    )
  );

-- ── 6. Storage-policies voor de project-docs bucket ─────────────────────────────
-- Bestandspad is altijd "${project_id}/...", dus (storage.foldername(name))[1] = project_id.
create policy "staff manage project doc files" on storage.objects for all
  using (bucket_id = 'project-docs' and can_access_project((storage.foldername(name))[1]::uuid));

create policy "client read visible doc files" on storage.objects for select
  using (
    bucket_id = 'project-docs'
    and exists (
      select 1 from project_documents pd
      join project_client_access pca on pca.project_id = pd.project_id
      join clients c on c.id = pca.client_id
      where pd.storage_path = name and pd.visible_to_client = true and c.auth_user_id = auth.uid()
    )
  );

-- ── 7. Projects/tasks: van "client.assigned_to" naar can_access_project() ──────
drop policy if exists "org member access" on projects;
create policy "org member access" on projects for all using (can_access_project(id));

drop policy if exists "org member access" on tasks;
create policy "org member access" on tasks for all using (can_access_project(tasks.project_id));

-- ── 8. Company-brede tabellen: simpele org-zichtbaarheid, geen assigned_to-laag
--    meer op dit niveau (dat hoort nu bij projecten, niet bij klanten/financiën).
drop policy if exists "org member access" on clients;
create policy "org member access" on clients for all using (is_member_of(organization_id));

drop policy if exists "org member access" on invoices;
create policy "org member access" on invoices for all
  using (exists (select 1 from clients c where c.id = invoices.client_id and is_member_of(c.organization_id)));

drop policy if exists "org member access" on recurring;
create policy "org member access" on recurring for all
  using (exists (select 1 from clients c where c.id = recurring.client_id and is_member_of(c.organization_id)));

drop policy if exists "org member access" on notes;
create policy "org member access" on notes for all
  using (exists (select 1 from clients c where c.id = notes.client_id and is_member_of(c.organization_id)));

drop policy if exists "org member access" on hosting;
create policy "org member access" on hosting for all
  using (exists (select 1 from clients c where c.id = hosting.client_id and is_member_of(c.organization_id)));

drop policy if exists "org member access" on meetings;
create policy "org member access" on meetings for all
  using (exists (select 1 from clients c where c.id = meetings.client_id and is_member_of(c.organization_id)));

-- ── 9. Klant-kant: van "alles onder mijn klantrecord" naar "alleen projecten
--    waarvoor ik expliciet ben uitgenodigd". Facturen en hosting verdwijnen
--    volledig uit het klantportaal (bewust — niet relevant voor de klant).
drop policy if exists "client read own projects" on projects;
create policy "client read own projects" on projects for select
  using (
    exists (
      select 1 from project_client_access pca join clients c on c.id = pca.client_id
      where pca.project_id = projects.id and c.auth_user_id = auth.uid()
    )
  );

drop policy if exists "client read own visible tasks" on tasks;
create policy "client read own visible tasks" on tasks for select
  using (
    visible_to_client = true
    and exists (
      select 1 from project_client_access pca join clients c on c.id = pca.client_id
      where pca.project_id = tasks.project_id and c.auth_user_id = auth.uid()
    )
  );

drop policy if exists "client create own task" on tasks;
create policy "client create own task" on tasks for insert
  with check (
    created_by = 'client' and visible_to_client = true
    and exists (
      select 1 from project_client_access pca join clients c on c.id = pca.client_id
      where pca.project_id = tasks.project_id and c.auth_user_id = auth.uid()
    )
  );

drop policy if exists "client update own visible task" on tasks;
create policy "client update own visible task" on tasks for update
  using (
    visible_to_client = true
    and exists (
      select 1 from project_client_access pca join clients c on c.id = pca.client_id
      where pca.project_id = tasks.project_id and c.auth_user_id = auth.uid()
    )
  )
  with check (
    visible_to_client = true
    and exists (
      select 1 from project_client_access pca join clients c on c.id = pca.client_id
      where pca.project_id = tasks.project_id and c.auth_user_id = auth.uid()
    )
  );

drop policy if exists "client read own invoices" on invoices;
drop view if exists client_hosting;

-- Notities en meetings blijven ongewijzigd (client-scoped, opt-in visible_to_client) —
-- daar is niets aan veranderd in dit bestand.
