-- Eenmalig herstelscript voor "Dit account is nog niet gekoppeld aan een klant-
-- of teamprofiel". Oorzaak: de eerdere volledige database-wipe (TRUNCATE ...
-- CASCADE op het public-schema) maakte de profiles-tabel leeg, maar liet
-- auth.users (de echte Supabase Auth-accounts) ongemoeid — dus elke bestaande
-- staff-gebruiker heeft nu wél een account maar geen profiles-rij meer, en
-- src/App.jsx (resolveRole) laat je zonder profiel/klantkoppeling/invite-claim
-- stuklopen op die foutmelding.
--
-- Dit script geeft elke auth-gebruiker die nu wees is (geen profiel, en geen
-- klantportaal-account) een lege profiles-rij terug. Ze komen daarna in de app
-- terecht op het bestaande "Je hebt nog geen werkruimte — + Werkruimte
-- aanmaken"-scherm (Dashboard.jsx), want organizations/memberships zijn ook
-- weggevallen bij de wipe — dat kan dit script niet zinvol terugzetten (er is
-- geen data meer om aan te koppelen), dus iedereen start met een lege, nieuwe
-- werkruimte. Voormalige teamleden van elkaar moeten elkaar dus opnieuw
-- uitnodigen zodra de eigenaar zijn werkruimte opnieuw heeft aangemaakt.
--
-- Bewust NIET van toepassing op auth-users die al een klantportaal-account
-- zijn (clients.auth_user_id) — die horen geen profiles-rij te hebben.

insert into profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id)
  and not exists (select 1 from clients c where c.auth_user_id = u.id)
on conflict (id) do nothing;
