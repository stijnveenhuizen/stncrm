-- Voer dit uit NA alle eerdere SQL-bestanden van vandaag.
--
-- Mega-restructuur fase 1/3: taken krijgen een tussenstatus ("in behandeling")
-- naast de bestaande done-boolean, en taken kunnen reacties krijgen (klant en
-- staff). Beide additief — bestaande queries op `done` blijven ongewijzigd
-- werken.
alter table tasks add column if not exists in_progress boolean not null default false;

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid,
  author_name text not null,
  author_type text not null check (author_type in ('staff','client')),
  content text not null,
  created_at timestamptz default now()
);
alter table task_comments enable row level security;

drop policy if exists "project team reads task comments" on task_comments;
create policy "project team reads task comments" on task_comments for select
  using (exists (select 1 from tasks t where t.id = task_comments.task_id and can_access_project(t.project_id)));

drop policy if exists "client reads own project task comments" on task_comments;
create policy "client reads own project task comments" on task_comments for select
  using (exists (
    select 1 from tasks t
    join project_client_access pca on pca.project_id = t.project_id
    join clients c on c.id = pca.client_id
    where t.id = task_comments.task_id and c.auth_user_id = auth.uid()
  ));

drop policy if exists "project team adds task comments" on task_comments;
create policy "project team adds task comments" on task_comments for insert
  with check (exists (select 1 from tasks t where t.id = task_comments.task_id and can_access_project(t.project_id)));

drop policy if exists "client adds task comments on own project" on task_comments;
create policy "client adds task comments on own project" on task_comments for insert
  with check (exists (
    select 1 from tasks t
    join project_client_access pca on pca.project_id = t.project_id
    join clients c on c.id = pca.client_id
    where t.id = task_comments.task_id and c.auth_user_id = auth.uid()
  ));

-- ── Mega-restructuur fase 3.3: facturen weer zichtbaar in het klantportaal ──────
-- (eerder vandaag bewust verwijderd, op uitdrukkelijk verzoek van de gebruiker nu
-- weer teruggezet — alleen lezen, geen betaalfunctie).
drop policy if exists "client reads own invoices" on invoices;
create policy "client reads own invoices" on invoices for select
  using (exists (select 1 from clients c where c.id = invoices.client_id and c.auth_user_id = auth.uid()));

-- ── Mega-restructuur fase 3.4: klant kan zelf bestanden uploaden per project ────
alter table project_documents add column if not exists uploaded_by_client_id uuid references clients(id);

drop policy if exists "client uploads own project documents" on project_documents;
create policy "client uploads own project documents" on project_documents for insert
  with check (exists (
    select 1 from project_client_access pca
    join clients c on c.id = pca.client_id
    where pca.project_id = project_documents.project_id and c.auth_user_id = auth.uid() and uploaded_by_client_id = c.id
  ));

drop policy if exists "client uploads doc files" on storage.objects;
create policy "client uploads doc files" on storage.objects for insert
  with check (
    bucket_id = 'project-docs'
    and exists (
      select 1 from project_client_access pca
      join clients c on c.id = pca.client_id
      where pca.project_id = (storage.foldername(name))[1]::uuid and c.auth_user_id = auth.uid()
    )
  );

-- ── Mega-restructuur fase 2.2: agency-logo zichtbaar in het klantportaal ────────
drop policy if exists "client reads company settings via project access" on company_settings;
create policy "client reads company settings via project access" on company_settings for select
  using (exists (
    select 1 from project_client_access pca
    join projects p on p.id = pca.project_id
    join clients c on c.id = pca.client_id
    where p.organization_id = company_settings.organization_id and c.auth_user_id = auth.uid()
  ));
