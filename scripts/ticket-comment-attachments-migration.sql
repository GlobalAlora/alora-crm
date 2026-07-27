-- ============================================================
-- Adjuntos en comentarios de tickets
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE ticket_comments
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
