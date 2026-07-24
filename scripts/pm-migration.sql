-- ================================================================
-- Alora CRM — PM Module · Phase 1 Migration
-- Run this in: Supabase → SQL Editor
-- ================================================================

-- 1. ENUMs
CREATE TYPE project_status_pm AS ENUM (
  'pendiente', 'en_desarrollo', 'en_revision', 'en_pausa', 'finalizado'
);

CREATE TYPE pm_priority AS ENUM ('baja', 'media', 'alta', 'urgente');

CREATE TYPE project_task_status AS ENUM (
  'pendiente', 'en_progreso', 'bloqueada', 'en_revision', 'finalizada', 'cancelada'
);

-- 2. Projects
CREATE TABLE projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text NOT NULL,
  descripcion     text,
  estado          project_status_pm NOT NULL DEFAULT 'pendiente',
  prioridad       pm_priority NOT NULL DEFAULT 'media',
  lead_id         uuid REFERENCES leads(id) ON DELETE SET NULL,
  fecha_inicio    date,
  fecha_fin       date,
  presupuesto_usd numeric,
  color           text NOT NULL DEFAULT '#5B7FFF',
  created_by      uuid REFERENCES auth.users(id),
  archived_at     timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_lead_id ON projects(lead_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_estado  ON projects(estado)  WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_created ON projects(created_at DESC) WHERE deleted_at IS NULL;

-- 3. Project members
CREATE TABLE project_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member', -- pm | member | viewer
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user    ON project_members(user_id);

-- 4. Task sections (Kanban columns — configurable per project)
CREATE TABLE task_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  color       text,
  position    int NOT NULL DEFAULT 0,
  is_done     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_sections_project ON task_sections(project_id);

-- 5. Project tasks (includes subtasks via parent_task_id)
--    Named project_tasks to avoid clash with the existing CRM tasks table
CREATE TABLE project_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_id      uuid REFERENCES task_sections(id) ON DELETE SET NULL,
  parent_task_id  uuid REFERENCES project_tasks(id) ON DELETE CASCADE,
  titulo          text NOT NULL,
  descripcion     text,
  estado          project_task_status NOT NULL DEFAULT 'pendiente',
  prioridad       pm_priority NOT NULL DEFAULT 'media',
  assignee_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES auth.users(id),
  fecha_inicio    date,
  fecha_limite    date,
  horas_estimadas numeric,
  position        float NOT NULL DEFAULT 0,
  custom_fields   jsonb NOT NULL DEFAULT '{}',
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_tasks_project  ON project_tasks(project_id)     WHERE deleted_at IS NULL;
CREATE INDEX idx_project_tasks_section  ON project_tasks(section_id)     WHERE deleted_at IS NULL;
CREATE INDEX idx_project_tasks_assignee ON project_tasks(assignee_id)    WHERE deleted_at IS NULL;
CREATE INDEX idx_project_tasks_parent   ON project_tasks(parent_task_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_tasks_limite   ON project_tasks(fecha_limite)   WHERE deleted_at IS NULL;

-- 6. updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER project_tasks_updated_at
  BEFORE UPDATE ON project_tasks FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. Row Level Security
ALTER TABLE projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_sections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users" ON projects
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users" ON project_members
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users" ON task_sections
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users" ON project_tasks
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
