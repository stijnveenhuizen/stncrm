-- Voer dit uit in de Supabase SQL Editor. Logt platform-impersonatie (zie
-- api/admin-impersonate.js) voor accountability. Alleen de service-role
-- (de serverless functions) mag hierbij — geen RLS-policies, dus de browser
-- (anon/authenticated key) kan deze tabel nooit rechtstreeks lezen of schrijven.

create table if not exists impersonation_log (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  target_user_id uuid not null,
  target_email text not null,
  created_at timestamptz default now()
);
alter table impersonation_log enable row level security;
