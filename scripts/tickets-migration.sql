-- ============================================================
-- TICKETS — Sistema de soporte / issues internos
-- Ejecutar en Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS tickets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero       TEXT NOT NULL,
  titulo       TEXT NOT NULL,
  descripcion  TEXT,
  estado       TEXT NOT NULL DEFAULT 'nuevo'
                 CHECK (estado IN ('nuevo','en_progreso','en_espera','resuelto','cerrado')),
  prioridad    TEXT NOT NULL DEFAULT 'media'
                 CHECK (prioridad IN ('baja','media','alta','urgente')),
  categoria    TEXT NOT NULL DEFAULT 'soporte'
                 CHECK (categoria IN ('bug','soporte','consulta','mejora','otro')),
  project_id   UUID REFERENCES projects(id)  ON DELETE SET NULL,
  lead_id      UUID REFERENCES leads(id)     ON DELETE SET NULL,
  assignee_id  UUID REFERENCES users(id)     ON DELETE SET NULL,
  created_by   UUID REFERENCES users(id)     ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_estado    ON tickets(estado);
CREATE INDEX IF NOT EXISTS idx_tickets_project   ON tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee  ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created   ON tickets(created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tickets' AND policyname='tickets_auth') THEN
    CREATE POLICY tickets_auth         ON tickets         FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ticket_comments' AND policyname='ticket_comments_auth') THEN
    CREATE POLICY ticket_comments_auth ON ticket_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON TABLE tickets         TO anon, authenticated, service_role;
GRANT ALL ON TABLE ticket_comments TO anon, authenticated, service_role;
