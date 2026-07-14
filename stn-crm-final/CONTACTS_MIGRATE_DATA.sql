-- Contact-centrische architectuur — fase 1: databackfill.
-- Voer dit uit NA CONTACTS_SETUP.sql, in één keer (bevat volgordelijke stappen
-- die op elkaar voortbouwen). Idempotent waar mogelijk (where contact_id is null
-- e.d.), maar bedoeld om één keer te draaien.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Contacts backfillen vanuit bestaande "pipeline"-rijen (elke deal had tot
--    nu toe zijn eigen bedrijfsgegevens; die worden nu een Contact).
-- ═══════════════════════════════════════════════════════════════════════
insert into contacts (
  organization_id, company, contact_name, email, phone, website, tags, status, owner,
  notes, last_activity_at, source, source_pipeline_id, created_at
)
select
  p.organization_id,
  p.company,
  nullif(trim(concat_ws(' ', nullif(p.fname, ''), nullif(p.lname, ''))), ''),
  p.email,
  p.phone,
  p.website,
  coalesce(p.tags, '{}'),
  case when p.stage = 'klant' or p.converted_client_id is not null or p.won_at is not null then 'CUSTOMER' else 'QUALIFIED' end,
  p.assigned_to,
  p.ai_summary,
  coalesce(p.last_activity_at, p.created_at, now()),
  'migratie-pipeline',
  p.id,
  coalesce(p.created_at, now())
from pipeline p
where p.contact_id is null
on conflict (organization_id, email) do nothing;

-- Koppel elke pipeline-rij aan het contact dat er zojuist (of eerder al) voor is aangemaakt.
update pipeline p
set contact_id = c.id
from contacts c
where p.contact_id is null and c.source_pipeline_id = p.id;

-- Vangnet: als twee pipeline-rijen hetzelfde e-mailadres delen, verloor de
-- tweede de ON CONFLICT-race hierboven en heeft nog geen contact — koppel
-- 'm aan het bestaande contact met datzelfde e-mailadres.
update pipeline p
set contact_id = c.id
from contacts c
where p.contact_id is null and p.email is not null
  and c.organization_id = p.organization_id and c.email = p.email;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Contacts backfillen vanuit outreach_prospects — alleen als die nog geen
--    duplicate_pipeline_id had (anders bestaat het contact al via stap 1).
-- ═══════════════════════════════════════════════════════════════════════
insert into contacts (
  organization_id, company, email, phone, website, website_domain, sector, status, notes,
  last_activity_at, source, source_outreach_prospect_id, created_at
)
select
  op.organization_id,
  op.name,
  latest_email.email,
  op.phone,
  op.website,
  op.website_domain,
  op.sector,
  case
    when exists (select 1 from outreach_flow_state fs where fs.prospect_id = op.id and fs.replied_at is not null) then 'REPLIED'
    when exists (select 1 from outreach_flow_state fs where fs.prospect_id = op.id and fs.last_sent_at is not null) then 'CONTACTED'
    else 'NEW'
  end,
  op.address,
  coalesce(op.created_at, now()),
  'migratie-outreach',
  op.id,
  coalesce(op.created_at, now())
from outreach_prospects op
left join lateral (
  select oe.email from outreach_emails oe
  where oe.prospect_id = op.id and oe.email is not null
  order by oe.created_at desc limit 1
) latest_email on true
where op.duplicate_pipeline_id is null
on conflict (organization_id, email) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Historische mail-events overzetten naar de Contact-tijdlijn. Resolvet
--    per outreach_prospect het bijbehorende contact: ofwel het contact dat in
--    stap 2 voor 'm is aangemaakt, ofwel (bij een pipeline-duplicaat) het
--    contact van die gekoppelde pipeline-rij.
-- ═══════════════════════════════════════════════════════════════════════
with prospect_contact as (
  select
    op.id as prospect_id,
    coalesce(c_own.id, c_via_pipeline.id) as contact_id,
    op.organization_id
  from outreach_prospects op
  left join contacts c_own on c_own.source_outreach_prospect_id = op.id
  left join pipeline pl on pl.id = op.duplicate_pipeline_id
  left join contacts c_via_pipeline on c_via_pipeline.id = pl.contact_id
)
insert into contact_activities (organization_id, contact_id, type, title, description, created_at)
select pc.organization_id, pc.contact_id, 'EMAIL_SENT', 'Mail verstuurd', fsend.subject, fsend.sent_at
from outreach_flow_sends fsend
join prospect_contact pc on pc.prospect_id = fsend.prospect_id
where pc.contact_id is not null;

with prospect_contact as (
  select op.id as prospect_id, coalesce(c_own.id, c_via_pipeline.id) as contact_id, op.organization_id
  from outreach_prospects op
  left join contacts c_own on c_own.source_outreach_prospect_id = op.id
  left join pipeline pl on pl.id = op.duplicate_pipeline_id
  left join contacts c_via_pipeline on c_via_pipeline.id = pl.contact_id
)
insert into contact_activities (organization_id, contact_id, type, title, created_at)
select pc.organization_id, pc.contact_id, 'EMAIL_OPENED', 'Mail geopend', fsend.opened_at
from outreach_flow_sends fsend
join prospect_contact pc on pc.prospect_id = fsend.prospect_id
where fsend.opened_at is not null and pc.contact_id is not null;

with prospect_contact as (
  select op.id as prospect_id, coalesce(c_own.id, c_via_pipeline.id) as contact_id, op.organization_id
  from outreach_prospects op
  left join contacts c_own on c_own.source_outreach_prospect_id = op.id
  left join pipeline pl on pl.id = op.duplicate_pipeline_id
  left join contacts c_via_pipeline on c_via_pipeline.id = pl.contact_id
)
insert into contact_activities (organization_id, contact_id, type, title, created_at)
select pc.organization_id, pc.contact_id, 'EMAIL_CLICKED', 'Klik op link', fsend.clicked_at
from outreach_flow_sends fsend
join prospect_contact pc on pc.prospect_id = fsend.prospect_id
where fsend.clicked_at is not null and pc.contact_id is not null;

with prospect_contact as (
  select op.id as prospect_id, coalesce(c_own.id, c_via_pipeline.id) as contact_id, op.organization_id
  from outreach_prospects op
  left join contacts c_own on c_own.source_outreach_prospect_id = op.id
  left join pipeline pl on pl.id = op.duplicate_pipeline_id
  left join contacts c_via_pipeline on c_via_pipeline.id = pl.contact_id
)
insert into contact_activities (organization_id, contact_id, type, title, created_at)
select pc.organization_id, pc.contact_id, 'EMAIL_REPLIED', 'Gereageerd', fsend.replied_at
from outreach_flow_sends fsend
join prospect_contact pc on pc.prospect_id = fsend.prospect_id
where fsend.replied_at is not null and pc.contact_id is not null;

-- Eén "Contact aangemaakt"-regel per gemigreerd contact, voor een nette start van de tijdlijn.
insert into contact_activities (organization_id, contact_id, type, title, created_at)
select organization_id, id, 'CONTACT_CREATED', 'Contact aangemaakt (gemigreerd)', created_at
from contacts
where source in ('migratie-pipeline', 'migratie-outreach');

-- ═══════════════════════════════════════════════════════════════════════
-- 4. pipeline_tasks -> contact_tasks. Deze tabel bleek in de huidige UI
--    nergens aangeroepen (dode code) — best-effort migratie voor het geval
--    er toch rijen in staan, met alleen de kolommen die zeker bestaan.
-- ═══════════════════════════════════════════════════════════════════════
insert into contact_tasks (organization_id, contact_id, deal_id, title, deadline, status, created_at)
select pl.organization_id, pl.contact_id, pt.prospect_id, 'Taak (gemigreerd van pipeline_tasks)', pt.due_date,
  case when pt.done then 'done' else 'open' end, now()
from pipeline_tasks pt
join pipeline pl on pl.id = pt.prospect_id
where pl.contact_id is not null;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Afronden: contact_id verplicht maken op pipeline, bridge-kolommen weg.
--    Pas uitvoeren als de bovenstaande stappen zijn gecontroleerd (zie
--    verificatiequery's in de plan-samenvatting).
-- ═══════════════════════════════════════════════════════════════════════
alter table pipeline alter column contact_id set not null;
alter table contacts drop column if exists source_pipeline_id;
alter table contacts drop column if exists source_outreach_prospect_id;
