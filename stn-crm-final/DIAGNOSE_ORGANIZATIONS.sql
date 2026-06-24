-- Plak de output van deze drie queries terug, dan zie ik precies wat er nu
-- daadwerkelijk in de database staat voor de tabel `organizations`.

-- 1. Welke policies bestaan er echt, en wat is hun exacte voorwaarde?
select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as with_check_expr
from pg_policy where polrelid = 'organizations'::regclass;

-- 2. Staat RLS aan, en staat "force RLS" aan (die laatste zou ook de table-owner blokkeren)?
select relrowsecurity, relforcerowsecurity from pg_class where relname = 'organizations';

-- 3. Heeft de "authenticated" rol wel echt INSERT-rechten op deze tabel?
select grantee, privilege_type from information_schema.role_table_grants where table_name = 'organizations';
