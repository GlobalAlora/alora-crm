-- Adds "cancelada_alora" as a valid value for leads.reunion_asistencia.
-- Used when ALORA itself decides not to hold an already-scheduled meeting
-- (e.g. after more WhatsApp back-and-forth, the lead turns out to be low
-- quality) — distinct from "no_se_presento" (lead's own no-show).
--
-- Run this once in the Supabase SQL Editor.

ALTER TABLE leads DROP CONSTRAINT leads_reunion_asistencia_check;

ALTER TABLE leads ADD CONSTRAINT leads_reunion_asistencia_check
  CHECK (reunion_asistencia IN ('se_presento', 'no_se_presento', 'reagendo', 'cancelada_alora'));
