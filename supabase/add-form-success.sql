-- Agrega opciones de confirmación post-submit a form_configs
ALTER TABLE public.form_configs
  ADD COLUMN IF NOT EXISTS success_title        text,
  ADD COLUMN IF NOT EXISTS success_message      text,
  ADD COLUMN IF NOT EXISTS success_redirect_url text;

NOTIFY pgrst, 'reload schema';
