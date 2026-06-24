-- Voer dit uit NA PROJECT_WORKSPACES_SETUP.sql.
--
-- Fix: can_access_project() kijkt of er al een rij in `projects` bestaat die aan
-- jou toegewezen is — bij het AANMAKEN van een nieuw project bestaat die rij nog
-- niet op het moment dat de RLS-check draait, dus elke project-aanmaak faalde.
-- Voor het aanmaken is een lichtere check genoeg (lid van de organisatie van de
-- klant); de strengere can_access_project()-check blijft gelden voor het lezen/
-- bewerken van bestaande projecten.
drop policy if exists "org member access" on projects;
create policy "org member access" on projects for all
  using (can_access_project(id))
  with check (exists (select 1 from clients c where c.id = projects.client_id and is_member_of(c.organization_id)));
