-- Voer dit uit NA MULTI_TENANT_SETUP.sql en FIX_PROFILES_RECURSION.sql.
--
-- Maakt het mogelijk dat een eigenaar de rol van een collega wijzigt (member <-> owner),
-- met drie beveiligingen:
--   1. Je kan nooit je eigen rol of organisatie wijzigen (geen self-promotion), ook al
--      is de `role`-kolom hierna breder grant-baar.
--   2. Alleen een 'owner' mag de rol van een ANDER teamlid wijzigen, en alleen binnen
--      zijn eigen organisatie.
--   3. Een organisatie kan nooit zonder eigenaar komen te zitten (laatste owner kan niet
--      gedemote worden) — afgedwongen met een trigger, niet alleen in de UI.

create or replace function my_current_role() returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable set search_path = public;

create or replace function is_org_owner() returns boolean as $$
  select role = 'owner' from profiles where id = auth.uid();
$$ language sql security definer stable set search_path = public;

-- Zelf-update mag nooit role/organization_id veranderen, zelfs niet als de kolom
-- straks breder grant-baar wordt (nodig zodat owners ándere profielen kunnen updaten).
drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = my_current_role() and organization_id = my_organization_id());

-- Eigenaar mag de rol van collega's (niet zichzelf) binnen de eigen organisatie wijzigen.
drop policy if exists "owner manages team roles" on profiles;
create policy "owner manages team roles" on profiles for update
  using (id <> auth.uid() and organization_id = my_organization_id() and is_org_owner())
  with check (id <> auth.uid() and organization_id = my_organization_id());

grant update (role) on profiles to authenticated;

-- Laatste-eigenaar-bescherming op database-niveau (niet alleen in de UI).
create or replace function prevent_orphan_organization() returns trigger as $$
begin
  if old.role = 'owner' and new.role <> 'owner' then
    if (select count(*) from profiles where organization_id = old.organization_id and role = 'owner') <= 1 then
      raise exception 'Een organisatie moet minstens één eigenaar hebben.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_prevent_orphan_org on profiles;
create trigger trg_prevent_orphan_org before update on profiles
  for each row execute function prevent_orphan_organization();
