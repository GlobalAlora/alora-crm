-- ============================================================
-- Alora CRM — Schema SQL
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Extensiones
create extension if not exists "pgcrypto";

-- ─── Enums ───────────────────────────────────────────────────

create type user_role as enum ('admin', 'sales', 'viewer');

create type pipeline_stage as enum (
  'lead_entrante',
  'lead_contactado',
  'sin_respuesta',
  'reunion_reservada',
  'reunion_realizada',
  'propuesta_en_armado',
  'propuesta_enviada',
  'follow_up',
  'cliente_ganado',
  'cliente_perdido',
  'no_cualificado'
);

create type activity_type as enum (
  'nota',
  'llamada',
  'email',
  'reunion',
  'cambio_estado',
  'tarea_completada',
  'webhook'
);

-- ─── Users (extiende auth.users de Supabase) ─────────────────

create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text not null,
  avatar_url  text,
  role        user_role not null default 'sales',
  created_at  timestamptz not null default now()
);

-- Auto-crear fila en public.users al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Leads ───────────────────────────────────────────────────

create table public.leads (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null,
  email                 text,
  telefono              text,
  empresa               text,
  pais                  text,
  servicio_interesado   text,
  presupuesto_estimado  numeric,
  estado_pipeline       pipeline_stage not null default 'lead_entrante',
  fuente                text,
  valor_propuesta_usd   numeric,
  tipo_cambio_usd_ars   numeric,
  kanban_position       numeric not null default 0,
  notas                 text,
  responsable_id        uuid references public.users(id) on delete set null,
  created_by            uuid references public.users(id) on delete set null,
  fecha_ingreso         timestamptz not null default now(),
  fecha_contacto        timestamptz,
  fecha_reunion         timestamptz,
  fecha_propuesta       timestamptz,
  fecha_followup        timestamptz,
  fecha_cierre          timestamptz,
  stage_updated_at      timestamptz not null default now(),
  last_activity_at      timestamptz not null default now(),
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Indexes
create index idx_leads_estado_pipeline  on public.leads (estado_pipeline) where deleted_at is null;
create index idx_leads_responsable_id   on public.leads (responsable_id)  where deleted_at is null;
create index idx_leads_fecha_ingreso    on public.leads (fecha_ingreso)    where deleted_at is null;
create index idx_leads_deleted_at       on public.leads (deleted_at);

-- Trigger: updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute procedure public.set_updated_at();

-- Trigger: stage_updated_at — solo cuando cambia estado_pipeline
create or replace function public.set_stage_updated_at()
returns trigger language plpgsql as $$
begin
  if new.estado_pipeline is distinct from old.estado_pipeline then
    new.stage_updated_at = now();
  end if;
  return new;
end;
$$;

create trigger trg_leads_stage_updated_at
  before update on public.leads
  for each row execute procedure public.set_stage_updated_at();

-- ─── Activities ──────────────────────────────────────────────

create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  tipo        activity_type not null,
  descripcion text not null,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index idx_activities_lead_id on public.activities (lead_id, created_at desc);

-- Trigger: actualiza last_activity_at en el lead
create or replace function public.update_lead_last_activity()
returns trigger language plpgsql as $$
begin
  update public.leads
  set last_activity_at = now()
  where id = new.lead_id;
  return new;
end;
$$;

create trigger trg_activities_last_activity
  after insert on public.activities
  for each row execute procedure public.update_lead_last_activity();

-- ─── Tasks ───────────────────────────────────────────────────

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  asignado_a    uuid references public.users(id) on delete set null,
  creado_por    uuid references public.users(id) on delete set null,
  titulo        text not null,
  descripcion   text,
  vencimiento   timestamptz,
  completada    boolean not null default false,
  completada_at timestamptz,
  created_at    timestamptz not null default now()
);

create index idx_tasks_lead_id     on public.tasks (lead_id);
create index idx_tasks_asignado_a  on public.tasks (asignado_a) where completada = false;
create index idx_tasks_vencimiento on public.tasks (vencimiento) where completada = false;

-- ─── Row Level Security ──────────────────────────────────────

alter table public.users     enable row level security;
alter table public.leads     enable row level security;
alter table public.activities enable row level security;
alter table public.tasks     enable row level security;

-- Helper: obtener rol del usuario actual
create or replace function public.current_user_role()
returns user_role language sql stable security definer as $$
  select role from public.users where id = auth.uid()
$$;

-- Users: todos los autenticados pueden verse
create policy "users_select" on public.users
  for select to authenticated using (true);

-- Leads: admin ve todo, sales ve los suyos + sin asignar
create policy "leads_select" on public.leads
  for select to authenticated using (
    deleted_at is null and (
      public.current_user_role() = 'admin'
      or responsable_id = auth.uid()
      or responsable_id is null
    )
  );

create policy "leads_insert" on public.leads
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'sales'));

create policy "leads_update" on public.leads
  for update to authenticated
  using (
    public.current_user_role() = 'admin'
    or (public.current_user_role() = 'sales' and responsable_id = auth.uid())
  );

create policy "leads_delete" on public.leads
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- Activities: hereda acceso del lead
create policy "activities_select" on public.activities
  for select to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
        and l.deleted_at is null
        and (
          public.current_user_role() = 'admin'
          or l.responsable_id = auth.uid()
          or l.responsable_id is null
        )
    )
  );

create policy "activities_insert" on public.activities
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'sales'));

-- Tasks: misma lógica
create policy "tasks_select" on public.tasks
  for select to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id and l.deleted_at is null
    )
  );

create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (public.current_user_role() in ('admin', 'sales'));

create policy "tasks_update" on public.tasks
  for update to authenticated
  using (public.current_user_role() in ('admin', 'sales'));
