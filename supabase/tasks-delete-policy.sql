-- ─── Migration: Add DELETE policy for tasks ─────────────────────────────────────
-- Run this in Supabase SQL Editor

-- Add DELETE policy for tasks
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

CREATE POLICY "tasks_delete" 
  ON public.tasks 
  FOR DELETE 
  TO authenticated 
  USING (public.current_user_role() in ('admin', 'sales'));
