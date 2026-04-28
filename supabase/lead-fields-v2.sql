-- ─── Lead fields v2 migration ─────────────────────────────────────────────────
-- Run this in Supabase SQL Editor

-- 1. New columns
alter table public.leads
  add column if not exists apellido             text,
  add column if not exists servicios_interesados text[]  not null default '{}',
  add column if not exists valor_propuesta_moneda text   not null default 'USD',
  add column if not exists valor_propuesta_ars   numeric;

-- 2. Constraint on moneda
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_valor_propuesta_moneda_check'
  ) then
    alter table public.leads
      add constraint leads_valor_propuesta_moneda_check
      check (valor_propuesta_moneda in ('USD', 'ARS'));
  end if;
end$$;

-- 3. Migrate existing servicio_interesado → servicios_interesados[]
update public.leads
  set servicios_interesados = array[servicio_interesado]
  where servicio_interesado is not null
    and servicio_interesado != ''
    and array_length(servicios_interesados, 1) is null;
