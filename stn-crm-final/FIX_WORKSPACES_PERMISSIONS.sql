-- Voer dit uit NA WORKSPACES_SETUP.sql.
--
-- Fix 1: WORKSPACES_SETUP.sql deed "revoke update on profiles from authenticated"
-- maar zette er nooit een nieuwe grant voor terug — niemand kon profiles meer
-- updaten. profiles heeft geen gevoelige kolommen meer (organization_id/role zijn
-- weg), dus een gewone volledige grant is hier veilig.
grant update on profiles to authenticated;

-- Fix 2: memberships.user_id verwees naar auth.users, niet naar profiles — Supabase
-- kan de relatie "memberships -> profiles" dan niet automatisch herkennen voor
-- embedded queries (gebruikt in Team-pagina en platform-admin). We laten hem nu naar
-- profiles(id) verwijzen (die op zijn beurt al 1-op-1 naar auth.users(id) verwijst,
-- dus functioneel verandert er niets — wel kan PostgREST de join nu vinden).
alter table memberships drop constraint if exists memberships_user_id_fkey;
alter table memberships add constraint memberships_user_id_fkey
  foreign key (user_id) references profiles(id);

-- Fix 3: defensief de insert-policy op organizations opnieuw zetten, voor het geval
-- die ergens onderweg verloren is gegaan.
drop policy if exists "create organization" on organizations;
create policy "create organization" on organizations for insert
  with check (true);
