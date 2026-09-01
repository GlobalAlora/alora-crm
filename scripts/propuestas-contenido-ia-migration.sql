-- Adds a JSONB column to hold the rich, structured content of an
-- AI-generated proposal (titulo, resumen, alcance, entregables, cronograma)
-- so the public proposal page can render it, independent of the existing
-- descripcion/valor/moneda fields which stay the source of truth for
-- Analytics and the lead ficha.
--
-- Run this once in the Supabase SQL Editor.

ALTER TABLE propuestas ADD COLUMN contenido jsonb;
