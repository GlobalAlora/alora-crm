-- Timestamp of when reunion_asistencia was last set (se_presento / no_se_presento
-- / reagendo / cancelada_alora). Lets Analytics report "Canceladas por ALORA"
-- (and similar) by the date the action actually happened, instead of the
-- lead's fecha_ingreso -- same reasoning as fecha_cierre for cierres.
--
-- Run this once in the Supabase SQL Editor.

ALTER TABLE leads ADD COLUMN reunion_asistencia_at timestamptz;
