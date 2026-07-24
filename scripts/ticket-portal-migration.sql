-- ============================================================
-- TICKET PORTAL — campos para clientes externos
-- Ejecutar DESPUÉS de tickets-migration.sql
-- ============================================================

-- Agregar campos de cliente e identificación pública al ticket
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ticket_token  TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS client_nombre TEXT,
  ADD COLUMN IF NOT EXISTS client_email  TEXT;

-- Generar tokens para tickets existentes que no tienen
UPDATE tickets SET ticket_token = gen_random_uuid()::text WHERE ticket_token IS NULL;

-- Hacer el token NOT NULL después de backfill
ALTER TABLE tickets ALTER COLUMN ticket_token SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_token ON tickets(ticket_token);
CREATE INDEX IF NOT EXISTS idx_tickets_client_email ON tickets(client_email);

-- Agregar soporte de comentarios de cliente a ticket_comments
ALTER TABLE ticket_comments
  ADD COLUMN IF NOT EXISTS is_client      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_nombre  TEXT;

-- Tarea vinculada del proyecto (se crea automáticamente al asignar un proyecto al ticket)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS linked_task_id UUID REFERENCES project_tasks(id) ON DELETE SET NULL;
