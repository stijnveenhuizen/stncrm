-- Voer dit uit NA FEATURE_PACK_SETUP.sql.
--
-- Het nieuwe Bedrijfsinstellingen-scherm laat de eigenaar de bedrijfsnaam
-- aanpassen (organizations.name). Tot nu toe was er alleen een select- en
-- insert-policy op organizations, geen update-policy.
drop policy if exists "owner updates organization" on organizations;
create policy "owner updates organization" on organizations for update
  using (is_member_of(id) and role_in(id) = 'owner');
