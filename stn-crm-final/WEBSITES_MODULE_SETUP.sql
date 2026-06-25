-- Voer dit uit NA alle eerdere SQL-bestanden van vandaag.
--
-- Websites-hub (Sites/Monitor/Licenties) + Onderhoudscontracten.
-- "Sites" = de bestaande "hosting"-tabel; die tabel wordt uitgebreid, niet
-- vervangen, zodat alle bestaande hosting-data/policies intact blijven.

-- ── Module 1: Website Monitor ────────────────────────────────────────────────────
alter table hosting add column if not exists monitor_enabled boolean not null default true;
alter table hosting add column if not exists check_interval_hours int not null default 24;
alter table hosting add column if not exists alert_email text;
alter table hosting add column if not exists pagespeed_url text;

create table if not exists website_checks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references hosting(id) on delete cascade,
  checked_at timestamptz not null default now(),
  is_online boolean not null default true,
  response_time_ms int,
  pagespeed_mobile int,
  pagespeed_desktop int,
  ssl_valid boolean,
  ssl_expires_at date,
  wp_version text,
  php_version text
);
alter table website_checks enable row level security;

create table if not exists website_plugins (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references hosting(id) on delete cascade,
  name text not null,
  version text,
  is_active boolean not null default true,
  has_update boolean not null default false,
  last_checked_at timestamptz default now(),
  unique(site_id, name)
);
alter table website_plugins enable row level security;

drop policy if exists "org member access" on website_checks;
create policy "org member access" on website_checks for all
  using (exists (select 1 from hosting h join clients c on c.id = h.client_id where h.id = website_checks.site_id and is_member_of(c.organization_id)));

drop policy if exists "org member access" on website_plugins;
create policy "org member access" on website_plugins for all
  using (exists (select 1 from hosting h join clients c on c.id = h.client_id where h.id = website_plugins.site_id and is_member_of(c.organization_id)));

-- ── Module 2: Onderhoudscontracten ──────────────────────────────────────────────
create table if not exists maintenance_contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references organizations(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  site_id uuid references hosting(id) on delete set null,
  name text not null,
  status text not null default 'actief' check (status in ('actief','gepauzeerd','gestopt')),
  hours_per_month numeric,
  fixed_price numeric,
  billing_cycle text not null default 'maandelijks' check (billing_cycle in ('maandelijks','kwartaal','jaarlijks')),
  start_date date not null default current_date,
  end_date date,
  includes_hosting boolean not null default false,
  includes_backups boolean not null default false,
  includes_updates boolean not null default true,
  includes_security boolean not null default false,
  notes text,
  created_at timestamptz default now()
);
alter table maintenance_contracts enable row level security;

create table if not exists maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references maintenance_contracts(id) on delete cascade,
  date date not null default current_date,
  title text not null,
  description text,
  hours_spent numeric,
  category text not null default 'overig' check (category in ('update','security','backup','design','content','overig')),
  logged_by uuid,
  visible_to_client boolean not null default true,
  created_at timestamptz default now()
);
alter table maintenance_logs enable row level security;

create table if not exists maintenance_reports (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references maintenance_contracts(id) on delete cascade,
  period_month int not null,
  period_year int not null,
  generated_at timestamptz default now(),
  pdf_url text,
  sent_at timestamptz,
  notes text,
  unique(contract_id, period_month, period_year)
);
alter table maintenance_reports enable row level security;

drop policy if exists "org member manages contracts" on maintenance_contracts;
create policy "org member manages contracts" on maintenance_contracts for all
  using (is_member_of(workspace_id));

drop policy if exists "org member manages logs" on maintenance_logs;
create policy "org member manages logs" on maintenance_logs for all
  using (exists (select 1 from maintenance_contracts mc where mc.id = maintenance_logs.contract_id and is_member_of(mc.workspace_id)));

drop policy if exists "client reads own visible logs" on maintenance_logs;
create policy "client reads own visible logs" on maintenance_logs for select
  using (
    visible_to_client and exists (
      select 1 from maintenance_contracts mc join clients c on c.id = mc.client_id
      where mc.id = maintenance_logs.contract_id and c.auth_user_id = auth.uid()
    )
  );

drop policy if exists "org member manages reports" on maintenance_reports;
create policy "org member manages reports" on maintenance_reports for all
  using (exists (select 1 from maintenance_contracts mc where mc.id = maintenance_reports.contract_id and is_member_of(mc.workspace_id)));

-- Privé-bucket voor de gegenereerde PDF's: pdf_url bevat het storage-pad, niet een
-- publieke URL — de app vraagt er bij het downloaden zelf een kortstondige
-- signed URL voor op (zelfde aanpak als project-docs).
insert into storage.buckets (id, name, public)
values ('maintenance-reports', 'maintenance-reports', false)
on conflict (id) do nothing;

drop policy if exists "org member access maintenance report files" on storage.objects;
create policy "org member access maintenance report files" on storage.objects for all
  using (
    bucket_id = 'maintenance-reports'
    and exists (
      select 1 from maintenance_contracts mc
      where mc.id::text = (storage.foldername(name))[1] and is_member_of(mc.workspace_id)
    )
  );

-- ── Module 3: Licentie tracker ───────────────────────────────────────────────────
create extension if not exists pgcrypto;

create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  site_id uuid references hosting(id) on delete set null,
  name text not null,
  category text not null default 'overig' check (category in ('plugin','theme','hosting','tool','domein','ssl','overig')),
  vendor text,
  license_key text,        -- ciphertext, zie encrypt-trigger hieronder
  license_key_plain text,  -- transient invoerveld: de app schrijft hier plaintext in,
                            -- de trigger versleutelt het direct en maakt dit veld weer leeg
  seats int,
  price numeric,
  billing_cycle text not null default 'jaarlijks' check (billing_cycle in ('eenmalig','maandelijks','jaarlijks')),
  renewal_date date,
  auto_renews boolean not null default true,
  paid_by text not null default 'bureau' check (paid_by in ('bureau','klant')),
  login_url text,
  notes text,
  created_at timestamptz default now()
);
alter table licenses enable row level security;

drop policy if exists "org member manages licenses" on licenses;
create policy "org member manages licenses" on licenses for all
  using (is_member_of(workspace_id));

-- license_key wordt NOOIT als plaintext opgeslagen: de app schrijft de ruwe key
-- naar license_key_plain, deze trigger versleutelt 'm meteen in license_key en
-- wist license_key_plain weer leeg, allemaal binnen dezelfde transactie.
-- Let op de beperking: de passphrase staat hardcoded in deze functie, dus dit
-- beschermt tegen toevallige blootstelling (Supabase Studio, exports, schermdelen)
-- maar NIET tegen iemand met volledige toegang tot de database zelf.
create or replace function encrypt_license_key_trigger() returns trigger as $$
begin
  if new.license_key_plain is not null then
    new.license_key := encode(pgp_sym_encrypt(new.license_key_plain, 'stn-crm-license-key-v1'), 'base64');
    new.license_key_plain := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_encrypt_license_key on licenses;
create trigger trg_encrypt_license_key before insert or update on licenses
  for each row execute function encrypt_license_key_trigger();

create or replace function get_decrypted_license_key(p_license_id uuid) returns text as $$
declare
  v_cipher text;
  v_org uuid;
begin
  select license_key, workspace_id into v_cipher, v_org from licenses where id = p_license_id;
  if v_cipher is null then return null; end if;
  if not is_member_of(v_org) then raise exception 'Geen toegang'; end if;
  return pgp_sym_decrypt(decode(v_cipher, 'base64'), 'stn-crm-license-key-v1');
end;
$$ language plpgsql security definer set search_path = public;
