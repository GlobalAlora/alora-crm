-- ─── Migration: Propuestas y campos de reunión ─────────────────────────────────────
-- Run this in Supabase SQL Editor

-- 1. Nueva tabla de propuestas
CREATE TABLE IF NOT EXISTS public.propuestas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  descripcion text NOT NULL DEFAULT '',
  valor_usd numeric,
  valor_ars numeric,
  moneda text NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD', 'ARS')),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.propuestas ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Propuestas viewable by authenticated users" 
  ON public.propuestas FOR SELECT 
  TO authenticated USING (true);

CREATE POLICY "Propuestas insertable by authenticated users" 
  ON public.propuestas FOR INSERT 
  TO authenticated WITH CHECK (true);

CREATE POLICY "Propuestas updatable by authenticated users" 
  ON public.propuestas FOR UPDATE 
  TO authenticated USING (true);

CREATE POLICY "Propuestas deletable by authenticated users" 
  ON public.propuestas FOR DELETE 
  TO authenticated USING (true);

-- 2. Nuevos campos en leads para reunión
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS reunion_hora time,
  ADD COLUMN IF NOT EXISTS reunion_link text;

-- 3. Trigger para updated_at en propuestas
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_propuestas_updated_at ON public.propuestas;
CREATE TRIGGER set_propuestas_updated_at
  BEFORE UPDATE ON public.propuestas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
