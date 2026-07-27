-- ============================================================
-- TICKET FOLLOWUP — seguimiento de inactividad del cliente
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Cuándo fue la última vez que el cliente hizo algo en el ticket
-- (creación + comentarios del cliente). El cron lo usa como punto
-- de partida para medir el silencio del cliente.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS last_client_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_sent_at         TIMESTAMPTZ;

-- Backfill: usar created_at como actividad inicial del cliente
UPDATE tickets
SET last_client_activity_at = created_at
WHERE last_client_activity_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_client_activity ON tickets(last_client_activity_at);
