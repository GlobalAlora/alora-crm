-- Add attachments column to project_tasks
ALTER TABLE project_tasks
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
