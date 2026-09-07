-- Historial de reuniones por lead: una fila por reunión agendada (no una por
-- lead). leads.fecha_reunion/reunion_hora/reunion_link/reunion_asistencia
-- siguen existiendo como snapshot de "la reunión vigente" -- de ahí siguen
-- leyendo los crons de recordatorios, el kanban y la integración de Calendar.
-- Correr en el SQL Editor de Supabase.

create table if not exists reuniones (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  fecha_reunion date not null,
  reunion_hora time,
  reunion_link text,
  asistencia text check (asistencia in ('se_presento', 'no_se_presento', 'reagendo', 'cancelada_alora')),
  asistencia_at timestamptz,
  origen text,           -- 'tidycal' | 'lidia' | 'manual'
  booking_id text,       -- id de booking de TidyCal, cuando aplica
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reuniones_lead_id_idx on reuniones(lead_id);
create index if not exists reuniones_fecha_reunion_idx on reuniones(fecha_reunion);

-- Sin este GRANT, PostgREST devuelve "permission denied for table reuniones"
-- en cualquier query -- incluso desde service_role -- porque una tabla creada
-- por el SQL Editor no hereda permisos automáticamente (mismo bug que ya
-- pasó con propuesta_eventos y push_subscriptions en este proyecto).
grant select, insert, update, delete on reuniones to anon, authenticated, service_role;
