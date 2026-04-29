-- ─── Migration: Add missing columns to leads ───────────────────────────────────
-- Run this in Supabase SQL Editor

-- Agregar columnas faltantes
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS apellido text,
ADD COLUMN IF NOT EXISTS email_secundario text,
ADD COLUMN IF NOT EXISTS servicios_interesados text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS valor_propuesta_ars numeric,
ADD COLUMN IF NOT EXISTS valor_propuesta_moneda text DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS form_id text,
ADD COLUMN IF NOT EXISTS form_data jsonb;
