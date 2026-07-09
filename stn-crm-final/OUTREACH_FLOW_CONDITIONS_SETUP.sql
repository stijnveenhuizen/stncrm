-- VOORSTEL — nog niet uitgevoerd. Bouwt voort op OUTREACH_FLOWS_SETUP.sql
-- (moet al gedraaid zijn). Alle nieuwe kolommen zijn nullable/hebben een
-- default die het BESTAANDE lineaire gedrag exact reproduceert — geen
-- bestaande flow of toewijzing verandert van gedrag door deze migratie.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Condities per stap
-- ═══════════════════════════════════════════════════════════════════════
-- Betekenis van NULL/false (het "niet geconfigureerd"-pad, = huidig gedrag):
--   on_no_reply_* leeg  → ga gewoon door naar de eerstvolgende stap
--                         (exact het huidige lineaire gedrag)
--   on_reply_* leeg     → flow stopt bij een reply
--                         (exact het huidige, niet-instelbare gedrag)
-- Zodra je een conditie WEL instelt: on_reply_next_step_id/on_no_reply_next_step_id
-- wijst naar een specifieke stap in dezelfde flow, OF on_*_stop = true voor een
-- expliciete stop. (Geen foreign-key-check dat de doel-stap in dezelfde flow zit —
-- dat bewaakt de applicatie, de UI biedt alleen stappen van de eigen flow aan.)
alter table outreach_flow_steps add column if not exists on_reply_next_step_id uuid references outreach_flow_steps(id);
alter table outreach_flow_steps add column if not exists on_reply_stop boolean not null default false;
alter table outreach_flow_steps add column if not exists on_no_reply_next_step_id uuid references outreach_flow_steps(id);
alter table outreach_flow_steps add column if not exists on_no_reply_stop boolean not null default false;

-- Extra kolom t.o.v. het eerder besproken voorstel (niet apart aangekondigd,
-- bij nader inzien noodzakelijk): met vertakkingen kan een reply de flow nu
-- laten DOORLOPEN i.p.v. altijd stoppen, dus "status" alleen is niet meer
-- genoeg om "er is ooit gereageerd" vast te leggen — dat wordt nu apart
-- bijgehouden, los van de huidige status in de flow.
alter table outreach_flow_state add column if not exists replied_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Throttling — kolom + instelling alvast klaar, effect afhankelijk van
--    Vercel-plan (zie toelichting in de UI: Hobby-cron draait max 1x/dag,
--    dus geen echte spreiding-in-minuten totdat er op Pro wordt geüpgraded).
-- ═══════════════════════════════════════════════════════════════════════
alter table company_settings add column if not exists outreach_throttle_seconds int not null default 60;
