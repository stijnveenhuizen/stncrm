-- Voer dit uit NA alle eerdere SQL-bestanden van vandaag.
--
-- Schema-toevoegingen voor de grote feature-ronde: taken-toewijzing, project-type,
-- automatische factuurnummers, bedrijfsinstellingen, en notificatie-"gelezen"-status.
-- Notificaties zelf worden live berekend uit bestaande data (verlopende hosting,
-- te late facturen, taken over deadline) — er is geen aparte cron-taak nodig, dus
-- alleen de leesstatus per gebruiker wordt opgeslagen.

-- ── 1. Taken: toewijzing aan een collega ────────────────────────────────────────
alter table tasks add column if not exists assigned_to uuid references profiles(id);

-- ── 2. Projecten: vrij invulbaar type (WordPress/Webflow/Custom/...) ───────────
alter table projects add column if not exists type text;

-- ── 3. Facturen: automatisch gegenereerd nummer (JJJJ-NNN per jaar) ────────────
alter table invoices add column if not exists invoice_number text;

create or replace function generate_invoice_number() returns trigger as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next int;
begin
  if new.invoice_number is null then
    select count(*) + 1 into v_next from invoices where invoice_number like v_year || '-%';
    new.invoice_number := v_year || '-' || lpad(v_next::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_generate_invoice_number on invoices;
create trigger trg_generate_invoice_number before insert on invoices
  for each row execute function generate_invoice_number();

-- ── 4. Bedrijfsinstellingen (1 rij per organisatie) ─────────────────────────────
create table if not exists company_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  logo_url text,
  primary_color text,
  vat_number text,
  coc_number text,
  invoice_address text,
  updated_at timestamptz default now()
);
alter table company_settings enable row level security;

create policy "org member reads settings" on company_settings for select
  using (is_member_of(organization_id));
create policy "owner manages settings" on company_settings for all
  using (is_member_of(organization_id) and role_in(organization_id) = 'owner');

-- Logo-opslag.
insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;

create policy "owner uploads own org logo" on storage.objects for all
  using (
    bucket_id = 'company-logos'
    and is_member_of((storage.foldername(name))[1]::uuid)
    and role_in((storage.foldername(name))[1]::uuid) = 'owner'
  );
create policy "anyone reads logos" on storage.objects for select
  using (bucket_id = 'company-logos');

-- ── 5. Notificaties: alleen de leesstatus wordt opgeslagen ─────────────────────
-- De notificaties zelf (verlopende hosting, te late facturen, taken over deadline)
-- worden live uit bestaande data berekend — geen los event-log nodig.
create table if not exists notification_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  notification_key text not null,
  read_at timestamptz default now(),
  unique(user_id, notification_key)
);
alter table notification_reads enable row level security;

create policy "manage own notification reads" on notification_reads for all
  using (user_id = auth.uid());
