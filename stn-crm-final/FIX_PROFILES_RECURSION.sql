-- Voer dit uit NA MULTI_TENANT_SETUP.sql.
--
-- Fix: "view org colleagues" en "bootstrap organization owner" op `profiles`
-- verwezen naar `profiles` vanuit hun eigen policy (zelf-referentie). Dat kan in
-- Postgres tot "infinite recursion detected in policy for relation profiles" leiden
-- (of in elk geval een hangende/falende query) — vermoedelijk de oorzaak van het
-- blijvend "Laden…"-scherm. Fix: de organisatie-lookup via een security-definer
-- functie laten lopen, die intern RLS negeert en dus niet kan recursen.

create or replace function my_organization_id() returns uuid as $$
  select organization_id from profiles where id = auth.uid();
$$ language sql security definer stable set search_path = public;

create or replace function organization_has_owner(org_id uuid) returns boolean as $$
  select exists (select 1 from profiles where organization_id = org_id);
$$ language sql security definer stable set search_path = public;

drop policy if exists "view org colleagues" on profiles;
create policy "view org colleagues" on profiles for select
  using (organization_id = my_organization_id());

drop policy if exists "bootstrap organization owner" on profiles;
create policy "bootstrap organization owner" on profiles for insert
  with check (
    id = auth.uid() and role = 'owner'
    and not organization_has_owner(organization_id)
  );
