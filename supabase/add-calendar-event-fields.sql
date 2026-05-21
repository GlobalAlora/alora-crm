-- Add Google Calendar event fields to leads table.
-- Run once in Supabase SQL Editor.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS calendar_event_id  TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS calendar_event_url TEXT DEFAULT NULL;
