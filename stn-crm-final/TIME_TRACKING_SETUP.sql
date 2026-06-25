-- Voer dit uit NA alle eerdere SQL-bestanden van vandaag.
--
-- Tijdregistratie per project: handmatige invoer of start/stop-timer (de timer
-- berekent zelf het aantal minuten en slaat alleen het resultaat op, geen losse
-- "running timer"-state in de database nodig).
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id),
  description text,
  minutes int not null,
  date date not null default current_date,
  created_at timestamptz default now()
);
alter table time_entries enable row level security;

drop policy if exists "project team reads time entries" on time_entries;
create policy "project team reads time entries" on time_entries for select
  using (can_access_project(project_id));

drop policy if exists "project team logs own time" on time_entries;
create policy "project team logs own time" on time_entries for insert
  with check (can_access_project(project_id) and user_id = auth.uid());

drop policy if exists "user updates own time entries" on time_entries;
create policy "user updates own time entries" on time_entries for update
  using (user_id = auth.uid());

drop policy if exists "user deletes own time entries" on time_entries;
create policy "user deletes own time entries" on time_entries for delete
  using (user_id = auth.uid());
