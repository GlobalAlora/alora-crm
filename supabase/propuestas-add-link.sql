-- ─── Migration: Add link column to propuestas ─────────────────────────────────────
-- Run this in Supabase SQL Editor

-- Agregar columna link a la tabla propuestas
ALTER TABLE public.propuestas 
ADD COLUMN IF NOT EXISTS link text;
