-- Voer dit uit NA alle eerdere SQL-bestanden van vandaag.
--
-- Offertemodule (fase 4.5): klant, omschrijving, bedrag, geldig tot.
-- Te accepteren/afwijzen door de klant via het portaal (geen betaling, alleen
-- akkoord geven). Bij acceptatie kan de offerte later handmatig naar een
-- factuur omgezet worden door de staff (geen automatische koppeling, om de
-- factuurnummering simpel en losstaand te houden).
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  quote_number text,
  description text not null,
  amount numeric not null,
  valid_until date,
  status text not null default 'verzonden' check (status in ('verzonden','geaccepteerd','afgewezen','verlopen')),
  created_at timestamptz default now()
);
alter table quotes enable row level security;

create or replace function generate_quote_number() returns trigger as $$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next int;
begin
  if new.quote_number is null then
    select count(*) + 1 into v_next from quotes where quote_number like 'OFF-' || v_year || '-%';
    new.quote_number := 'OFF-' || v_year || '-' || lpad(v_next::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_generate_quote_number on quotes;
create trigger trg_generate_quote_number before insert on quotes
  for each row execute function generate_quote_number();

drop policy if exists "staff manages quotes" on quotes;
create policy "staff manages quotes" on quotes for all
  using (exists (select 1 from clients c where c.id = quotes.client_id and is_member_of(c.organization_id)));

drop policy if exists "client reads own quotes" on quotes;
create policy "client reads own quotes" on quotes for select
  using (exists (select 1 from clients c where c.id = quotes.client_id and c.auth_user_id = auth.uid()));

drop policy if exists "client responds to own quotes" on quotes;
create policy "client responds to own quotes" on quotes for update
  using (exists (select 1 from clients c where c.id = quotes.client_id and c.auth_user_id = auth.uid()));
