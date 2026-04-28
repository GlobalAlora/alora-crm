-- ─── propuestas + stage_history migration ─────────────────────────────────────
-- Run this in Supabase SQL Editor

-- 1. Tabla propuestas
create table if not exists public.propuestas (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  descripcion   text not null,
  valor_usd     numeric,
  valor_ars     numeric,
  moneda        text not null default 'USD' check (moneda in ('USD', 'ARS')),
  tipo_pago     text not null default 'unica_vez' check (tipo_pago in ('unica_vez', 'mensual')),
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  link          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- RLS propuestas
alter table public.propuestas enable row level security;

create policy "propuestas: authenticated read"
  on public.propuestas for select
  to authenticated using (true);

create policy "propuestas: authenticated insert"
  on public.propuestas for insert
  to authenticated with check (true);

create policy "propuestas: authenticated update"
  on public.propuestas for update
  to authenticated using (true) with check (true);

create policy "propuestas: authenticated delete"
  on public.propuestas for delete
  to authenticated using (true);

-- service_role full access
grant all on public.propuestas to service_role;
grant all on public.propuestas to authenticated;

-- 2. Tabla stage_history
create table if not exists public.stage_history (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  etapa         text not null,
  fecha_ingreso timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- RLS stage_history
alter table public.stage_history enable row level security;

create policy "stage_history: authenticated read"
  on public.stage_history for select
  to authenticated using (true);

create policy "stage_history: authenticated insert"
  on public.stage_history for insert
  to authenticated with check (true);

create policy "stage_history: authenticated update"
  on public.stage_history for update
  to authenticated using (true) with check (true);

-- service_role full access
grant all on public.stage_history to service_role;
grant all on public.stage_history to authenticated;

-- 3. Trigger para updated_at en propuestas
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists propuestas_updated_at on public.propuestas;
create trigger propuestas_updated_at
  before update on public.propuestas
  for each row execute function public.set_updated_at();
