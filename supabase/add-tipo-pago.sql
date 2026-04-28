-- Agrega tipo_pago a propuestas si no existe
ALTER TABLE public.propuestas
  ADD COLUMN IF NOT EXISTS tipo_pago text NOT NULL DEFAULT 'unica_vez'
    CHECK (tipo_pago IN ('unica_vez', 'mensual'));

-- Recarga el schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
