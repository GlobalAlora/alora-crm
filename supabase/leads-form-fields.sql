-- ─── Migration: Add form_id and form_data columns to leads ─────────────────────────────
-- Run this in Supabase SQL Editor

-- Agregar columnas para tracking de formularios embed
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS form_id text,
ADD COLUMN IF NOT EXISTS form_data jsonb;
