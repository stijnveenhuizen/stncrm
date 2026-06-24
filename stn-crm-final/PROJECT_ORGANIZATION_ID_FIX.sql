-- Voer dit uit NA FIX_PROJECT_INSERT.sql.
--
-- Een project zonder gekoppelde klant had geen enkele manier om te weten bij
-- welke organisatie het hoort (dat liep altijd via project -> klant -> org).
-- Daardoor was zo'n project onzichtbaar in de lijst én onbereikbaar via
-- can_access_project(), zelfs voor de eigenaar. Projects krijgt nu, net als
-- clients en pipeline, een eigen organization_id-kolom.

alter table projects add column if not exists organization_id uuid references organizations(id);

-- Backfill bestaande projecten via hun klant, waar mogelijk.
update projects set organization_id = (select c.organization_id from clients c where c.id = projects.client_id)
where organization_id is null and client_id is not null;

-- can_access_project() leest nu organization_id rechtstreeks van het project,
-- niet meer via een join naar clients — werkt dus ook zonder gekoppelde klant.
create or replace function can_access_project(proj_id uuid) returns boolean as $$
  select exists (
    select 1 from projects p
    where p.id = proj_id
      and is_member_of(p.organization_id)
      and (
        role_in(p.organization_id) = 'owner'
        or exists (select 1 from project_members pm where pm.project_id = proj_id and pm.user_id = auth.uid())
      )
  );
$$ language sql security definer stable set search_path = public;

drop policy if exists "org member access" on projects;
create policy "org member access" on projects for all
  using (can_access_project(id))
  with check (is_member_of(organization_id));
