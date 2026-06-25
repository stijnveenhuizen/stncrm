-- Voer dit uit NA alle eerdere SQL-bestanden van vandaag (i.h.b. PIPELINE_PRO_SETUP.sql).
--
-- Pipeline extra features: deal rotting, snooze, dupliceren, AI-assistent.

-- ── Feature 1: Deal rotting ──────────────────────────────────────────────────────
alter table pipeline_stages add column if not exists rot_days int default 7;
alter table pipeline add column if not exists last_activity_at timestamptz default now();

-- last_activity_at automatisch bijhouden: bij elke wijziging aan de prospect zelf
-- (bewerking, fase-wisseling, snooze, etc.) en bij elke nieuwe activiteit. Als
-- trigger i.p.v. verspreide client-side updates, zodat dit altijd klopt
-- ongeacht welk code-pad de wijziging veroorzaakt.
create or replace function touch_prospect_last_activity() returns trigger as $$
begin
  new.last_activity_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_prospect_last_activity on pipeline;
create trigger trg_touch_prospect_last_activity before update on pipeline
  for each row execute function touch_prospect_last_activity();

create or replace function touch_prospect_on_activity() returns trigger as $$
begin
  update pipeline set last_activity_at = now() where id = new.prospect_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_prospect_on_activity on prospect_activities;
create trigger trg_touch_prospect_on_activity after insert on prospect_activities
  for each row execute function touch_prospect_on_activity();

-- ── Feature 2: Snooze ────────────────────────────────────────────────────────────
alter table pipeline add column if not exists snoozed_until timestamptz;
alter table pipeline add column if not exists snooze_reason text;

-- ── Feature 4: AI-assistent ──────────────────────────────────────────────────────
alter table pipeline add column if not exists ai_summary text;

create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  date date not null,
  count int not null default 0,
  unique(user_id, date)
);
alter table ai_usage enable row level security;
-- Alleen de AI-serverroute (service-role, omzeilt RLS) schrijft/leest dit — geen
-- client-side toegang nodig, maar RLS staat aan voor consistentie met de rest
-- van het schema.
drop policy if exists "user reads own ai usage" on ai_usage;
create policy "user reads own ai usage" on ai_usage for select
  using (user_id = auth.uid());
