-- ============================================================
-- form_configs — dynamic embeddable lead capture forms
-- Run in Supabase SQL Editor
-- ============================================================

create table if not exists public.form_configs (
  id          text        primary key default substring(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  name        text        not null,
  title       text        not null default '¿Hablamos?',
  subtitle    text                 default 'Completá el formulario y te contactamos en 24hs.',
  color       text        not null default '#2563eb',
  fields      jsonb       not null default '[]',
  tags        text[]               default '{}',
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RLS
alter table public.form_configs enable row level security;

-- Public read (needed for embed.js on external sites)
create policy "form_configs: public read active"
  on public.form_configs for select
  using (active = true);

-- Auth users can manage
create policy "form_configs: authenticated manage"
  on public.form_configs for all
  to authenticated
  using (true)
  with check (true);

-- Grants
grant select on public.form_configs to anon;
grant all    on public.form_configs to authenticated, service_role;

-- ── Seed: default form ──────────────────────────────────────────
insert into public.form_configs (id, name, title, subtitle, color, fields, tags)
values (
  'default',
  'Formulario principal',
  '¿Hablamos?',
  'Completá el formulario y te contactamos en 24hs.',
  '#2563eb',
  '[
    {"name":"nombre",              "label":"Nombre",                    "type":"text",     "required":true,  "placeholder":"Juan Pérez",          "width":"half"},
    {"name":"empresa",             "label":"Empresa",                   "type":"text",     "required":false, "placeholder":"Mi empresa",          "width":"half"},
    {"name":"email",               "label":"Email",                     "type":"email",    "required":false, "placeholder":"juan@empresa.com",    "width":"half"},
    {"name":"telefono",            "label":"Teléfono",                  "type":"phone",    "required":false, "placeholder":"+54 11 0000-0000",    "width":"half"},
    {"name":"servicio_interesado", "label":"¿Qué servicio te interesa?","type":"select",   "required":false, "options":["Diseño web","SEO","Google Ads","Meta Ads","Redes sociales","Branding","Email marketing","Otro"],"width":"full"},
    {"name":"mensaje",             "label":"Mensaje",                   "type":"textarea", "required":false, "placeholder":"Contanos en qué podemos ayudarte...","width":"full"}
  ]',
  '{}'
)
on conflict (id) do nothing;

-- ── Example: custom sales form ──────────────────────────────────
insert into public.form_configs (name, title, subtitle, color, fields, tags)
values (
  'Formulario ventas B2B',
  '¿Necesitás una propuesta?',
  'Completá los datos y te enviamos una propuesta en 48hs.',
  '#7c3aed',
  '[
    {"name":"nombre",              "label":"Nombre completo",  "type":"text",     "required":true,  "placeholder":"Juan Pérez",       "width":"half"},
    {"name":"empresa",             "label":"Empresa",          "type":"text",     "required":true,  "placeholder":"Empresa S.A.",     "width":"half"},
    {"name":"email",               "label":"Email corporativo","type":"email",    "required":true,  "placeholder":"juan@empresa.com", "width":"half"},
    {"name":"telefono",            "label":"WhatsApp",         "type":"phone",    "required":false, "placeholder":"+54 9 11 0000-0000","width":"half"},
    {"name":"presupuesto_estimado","label":"Presupuesto (USD)","type":"text",     "required":false, "placeholder":"5000",             "width":"half"},
    {"name":"servicio_interesado", "label":"Servicio",         "type":"select",   "required":true,  "options":["SEO","Google Ads","Meta Ads","Diseño web","Paquete completo"],"width":"half"},
    {"name":"mensaje",             "label":"Descripción del proyecto","type":"textarea","required":false,"placeholder":"Contanos tu proyecto...","width":"full"}
  ]',
  '{b2b, ventas}'
)
on conflict do nothing;
