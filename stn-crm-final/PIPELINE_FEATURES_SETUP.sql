-- Voer dit uit NA FEATURE_PACK_SETUP.sql.
--
-- Pipeline: vrij invulbare reden bij het afwijzen van een prospect.
alter table pipeline add column if not exists lost_reason text;
