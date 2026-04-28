-- ============================================================
-- Forms Tracking: form_id on leads + embed_events table
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add form_id to leads (nullable, FK to form_configs)
alter table public.leads
  add column if not exists form_id text references public.form_configs(id) on delete set null;

-- 2. embed_events — one row per tracked interaction
create table if not exists public.embed_events (
  id          uuid        primary key default gen_random_uuid(),
  form_id     text        not null,
  event_type  text        not null check (event_type in ('form_opened','form_started','form_submitted','form_abandoned')),
  session_id  text,
  metadata    jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists embed_events_form_id_idx   on public.embed_events (form_id);
create index if not exists embed_events_event_type_idx on public.embed_events (event_type);
create index if not exists embed_events_created_at_idx on public.embed_events (created_at desc);

-- RLS
alter table public.embed_events enable row level security;

-- Public insert (embed.js fires from external sites, no auth)
create policy "embed_events: public insert"
  on public.embed_events for insert
  to anon
  with check (true);

-- Authenticated users can read
create policy "embed_events: authenticated read"
  on public.embed_events for select
  to authenticated
  using (true);

-- Grants
grant insert           on public.embed_events to anon;
grant select, insert   on public.embed_events to authenticated;
grant all              on public.embed_events to service_role;
