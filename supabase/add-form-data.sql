-- Agrega form_data a leads para guardar todos los campos del formulario
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS form_data JSONB;

-- Índice para búsquedas por form_data
CREATE INDEX IF NOT EXISTS leads_form_data_idx ON public.leads USING GIN (form_data);

NOTIFY pgrst, 'reload schema';
