-- ─── Migration: Stage History ─────────────────────────────────────────────────────
-- Run this in Supabase SQL Editor

-- Nueva tabla de historial de cambios de etapa
CREATE TABLE IF NOT EXISTS public.stage_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  etapa text NOT NULL,
  fecha_ingreso timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stage_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Stage history viewable by authenticated users" 
  ON public.stage_history FOR SELECT 
  TO authenticated USING (true);

CREATE POLICY "Stage history insertable by authenticated users" 
  ON public.stage_history FOR INSERT 
  TO authenticated WITH CHECK (true);

CREATE POLICY "Stage history updatable by authenticated users" 
  ON public.stage_history FOR UPDATE 
  TO authenticated USING (true);

-- Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_stage_history_lead_id ON public.stage_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_stage_history_fecha_ingreso ON public.stage_history(fecha_ingreso DESC);

-- Trigger para insertar historial cuando cambia la etapa
CREATE OR REPLACE FUNCTION public.record_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo insertar si la etapa cambió
  IF OLD.estado_pipeline IS DISTINCT FROM NEW.estado_pipeline THEN
    INSERT INTO public.stage_history (lead_id, etapa, fecha_ingreso)
    VALUES (NEW.id, NEW.estado_pipeline, NEW.stage_updated_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_record_stage_change ON public.leads;
CREATE TRIGGER trigger_record_stage_change
  AFTER UPDATE OF estado_pipeline ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.record_stage_change();
