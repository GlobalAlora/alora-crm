-- Add Google Drive folder fields to leads table.
-- Run once in Supabase SQL Editor.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS drive_folder_id  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS drive_folder_url TEXT DEFAULT NULL;

-- Optional: index for quick lookup (e.g. "find lead by folder ID")
CREATE INDEX IF NOT EXISTS leads_drive_folder_id_idx
  ON public.leads (drive_folder_id)
  WHERE drive_folder_id IS NOT NULL;
