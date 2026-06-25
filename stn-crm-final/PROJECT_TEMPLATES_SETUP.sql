-- Voer dit uit NA alle eerdere SQL-bestanden van vandaag.
--
-- Projecttemplates (fase 4.3): sla de taken van een bestaand project op als
-- herbruikbare template, kies die template bij het aanmaken van een nieuw
-- project om de taken automatisch in te laden.
create table if not exists project_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);
alter table project_templates enable row level security;

drop policy if exists "org member reads templates" on project_templates;
create policy "org member reads templates" on project_templates for select
  using (is_member_of(organization_id));
drop policy if exists "org member manages templates" on project_templates;
create policy "org member manages templates" on project_templates for all
  using (is_member_of(organization_id));

create table if not exists project_template_tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references project_templates(id) on delete cascade,
  description text not null,
  priority text not null default 'normaal',
  sort_order int not null default 0
);
alter table project_template_tasks enable row level security;

drop policy if exists "org member reads template tasks" on project_template_tasks;
create policy "org member reads template tasks" on project_template_tasks for select
  using (exists (select 1 from project_templates pt where pt.id = project_template_tasks.template_id and is_member_of(pt.organization_id)));
drop policy if exists "org member manages template tasks" on project_template_tasks;
create policy "org member manages template tasks" on project_template_tasks for all
  using (exists (select 1 from project_templates pt where pt.id = project_template_tasks.template_id and is_member_of(pt.organization_id)));
