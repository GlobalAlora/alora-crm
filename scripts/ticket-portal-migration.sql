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

-- Datos adicionales del cliente
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS client_empresa  TEXT,
  ADD COLUMN IF NOT EXISTS client_telefono TEXT,
  ADD COLUMN IF NOT EXISTS attachments     JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Storage bucket para adjuntos (ejecutar también en Supabase SQL Editor)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-attachments',
  'ticket-attachments',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','video/webm']
) ON CONFLICT (id) DO NOTHING;

-- Política: lectura pública (para ver las imágenes en el tracking)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname='ticket-attachments-public-read') THEN
    CREATE POLICY "ticket-attachments-public-read" ON storage.objects
      FOR SELECT USING (bucket_id = 'ticket-attachments');
  END IF;
END $$;
