-- Voer dit uit NA alle eerdere SQL-bestanden van vandaag.
--
-- Pipedrive-niveau pipeline — fase 1: datamodel.
--
-- Let op naamgeving: de bestaande tabel "pipeline" bevat de prospects/leads zelf
-- (wat de briefing "prospects" noemt). Die naam blijft ongewijzigd om bestaande
-- code/queries niet te breken. De NIEUWE tabellen "pipelines" en "pipeline_stages"
-- zijn de configuratielaag (de funnels/fases zelf) waar "pipeline"-rijen nu naar
-- verwijzen via pipeline_id/stage_id.

-- ── 1.1 Pipelines (meerdere per werkruimte) ─────────────────────────────────────
create table if not exists pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz default now()
);
alter table pipelines enable row level security;
drop policy if exists "org member manages pipelines" on pipelines;
create policy "org member manages pipelines" on pipelines for all
  using (is_member_of(workspace_id));

-- ── 1.2 Pipeline-fases ───────────────────────────────────────────────────────────
create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  win_probability int not null default 0,
  color text not null default '#6b7280',
  is_won boolean not null default false,
  is_lost boolean not null default false
);
alter table pipeline_stages enable row level security;
drop policy if exists "org member manages pipeline stages" on pipeline_stages;
create policy "org member manages pipeline stages" on pipeline_stages for all
  using (exists (select 1 from pipelines p where p.id = pipeline_stages.pipeline_id and is_member_of(p.workspace_id)));

-- ── 1.3 Prospects (bestaande "pipeline"-tabel) uitbreiden ───────────────────────
alter table pipeline add column if not exists pipeline_id uuid references pipelines(id);
alter table pipeline add column if not exists stage_id uuid references pipeline_stages(id);
alter table pipeline add column if not exists win_probability int;
alter table pipeline add column if not exists expected_close_date date;
alter table pipeline add column if not exists lost_at timestamptz;
alter table pipeline add column if not exists won_at timestamptz;
alter table pipeline add column if not exists assigned_to uuid references profiles(id);
alter table pipeline add column if not exists tags text[] not null default '{}';
alter table pipeline add column if not exists website_type text;
alter table pipeline add column if not exists priority text not null default 'normaal';
-- lost_reason bestaat al (PIPELINE_FEATURES_SETUP.sql); company/phone/source ook al.

-- ── 1.4 Activiteitenlog per prospect ────────────────────────────────────────────
create table if not exists prospect_activities (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references pipeline(id) on delete cascade,
  user_id uuid,
  type text not null check (type in ('call','email','meeting','notitie','taak','fase_wisseling','herinnering','automatisering')),
  title text not null,
  description text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  is_completed boolean not null default false,
  created_at timestamptz default now()
);
alter table prospect_activities enable row level security;
drop policy if exists "org member manages prospect activities" on prospect_activities;
create policy "org member manages prospect activities" on prospect_activities for all
  using (exists (select 1 from pipeline p where p.id = prospect_activities.prospect_id and is_member_of(p.organization_id)));

-- ── 1.5 Pipeline-automatiseringen ────────────────────────────────────────────────
create table if not exists pipeline_automations (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null default 'Automatisering',
  trigger_stage_id uuid references pipeline_stages(id),
  trigger_event text not null check (trigger_event in ('entered_stage','left_stage','deal_won','deal_lost')),
  action_type text not null check (action_type in ('create_task','create_reminder','send_notification')),
  action_config jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz default now()
);
alter table pipeline_automations enable row level security;
drop policy if exists "org member manages automations" on pipeline_automations;
create policy "org member manages automations" on pipeline_automations for all
  using (exists (select 1 from pipelines p where p.id = pipeline_automations.pipeline_id and is_member_of(p.workspace_id)));

-- ── 1.6 Offertes: bestaande "quotes"-tabel uitbreiden met prospect-koppeling ────
-- (quotes bestond al voor klant-offertes uit Financiën — die blijft werken,
-- client_id wordt alleen nullable zodat een offerte ook aan een prospect kan
-- hangen vóórdat iemand klant is.)
alter table quotes alter column client_id drop not null;
alter table quotes add column if not exists prospect_id uuid references pipeline(id) on delete cascade;
alter table quotes add column if not exists title text;
alter table quotes add column if not exists items jsonb not null default '[]';
alter table quotes add column if not exists subtotal numeric;
alter table quotes add column if not exists btw_percentage numeric not null default 21;
alter table quotes add column if not exists total numeric;
alter table quotes add column if not exists sent_at timestamptz;
alter table quotes add column if not exists accepted_at timestamptz;
alter table quotes add column if not exists notes text;

drop policy if exists "staff manages quotes" on quotes;
create policy "staff manages quotes" on quotes for all
  using (
    (client_id is not null and exists (select 1 from clients c where c.id = quotes.client_id and is_member_of(c.organization_id)))
    or (prospect_id is not null and exists (select 1 from pipeline p where p.id = quotes.prospect_id and is_member_of(p.organization_id)))
  );
-- de bestaande client-only select/update-policies blijven ook gelden voor klanten
-- die hun eigen (client_id-gekoppelde) offerte inzien — ongewijzigd.

-- ── Backfill: elke werkruimte krijgt een standaardpipeline met 7 standaardfases,
--    bestaande prospects worden gekoppeld op basis van hun huidige tekst-stage ──
do $$
declare
  org record;
  new_pipeline_id uuid;
  stage_benaderd uuid; stage_interesse uuid; stage_gesprek uuid; stage_offerte uuid;
  stage_akkoord uuid; stage_klant uuid; stage_afgewezen uuid;
begin
  for org in select id from organizations loop
    if exists (select 1 from pipelines where workspace_id = org.id and is_default = true) then
      continue;
    end if;

    insert into pipelines (workspace_id, name, is_default) values (org.id, 'Standaard pipeline', true) returning id into new_pipeline_id;

    insert into pipeline_stages (pipeline_id, name, sort_order, win_probability, color, is_won, is_lost)
      values (new_pipeline_id, 'Benaderd', 0, 10, '#6b7280', false, false) returning id into stage_benaderd;
    insert into pipeline_stages (pipeline_id, name, sort_order, win_probability, color, is_won, is_lost)
      values (new_pipeline_id, 'Interesse', 1, 25, '#2563eb', false, false) returning id into stage_interesse;
    insert into pipeline_stages (pipeline_id, name, sort_order, win_probability, color, is_won, is_lost)
      values (new_pipeline_id, 'Gesprek', 2, 50, '#7c3aed', false, false) returning id into stage_gesprek;
    insert into pipeline_stages (pipeline_id, name, sort_order, win_probability, color, is_won, is_lost)
      values (new_pipeline_id, 'Offerte', 3, 75, '#d97706', false, false) returning id into stage_offerte;
    insert into pipeline_stages (pipeline_id, name, sort_order, win_probability, color, is_won, is_lost)
      values (new_pipeline_id, 'Akkoord', 4, 90, '#3db68e', false, false) returning id into stage_akkoord;
    insert into pipeline_stages (pipeline_id, name, sort_order, win_probability, color, is_won, is_lost)
      values (new_pipeline_id, 'Klant gewonnen', 5, 100, '#16a34a', true, false) returning id into stage_klant;
    insert into pipeline_stages (pipeline_id, name, sort_order, win_probability, color, is_won, is_lost)
      values (new_pipeline_id, 'Afgewezen', 6, 0, '#dc2626', false, true) returning id into stage_afgewezen;

    update pipeline set
      pipeline_id = new_pipeline_id,
      stage_id = case stage
        when 'benaderd' then stage_benaderd
        when 'interesse' then stage_interesse
        when 'gesprek' then stage_gesprek
        when 'offerte' then stage_offerte
        when 'akkoord' then stage_akkoord
        when 'klant' then stage_klant
        when 'afgewezen' then stage_afgewezen
        else stage_benaderd
      end,
      win_probability = case stage
        when 'benaderd' then 10 when 'interesse' then 25 when 'gesprek' then 50
        when 'offerte' then 75 when 'akkoord' then 90 when 'klant' then 100 when 'afgewezen' then 0
        else 10
      end
    where organization_id = org.id and pipeline_id is null;
  end loop;
end $$;
