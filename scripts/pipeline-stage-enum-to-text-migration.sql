-- Pipeline stage: convert from fixed Postgres enum to free text
--
-- Problem: `estado_pipeline` is typed as the
-- Postgres enum `pipeline_stage`, which only allows the 13 stages that
-- existed when the enum was created. Custom stages added later via
-- Configuración → Pipeline (which live in the `pipeline_stages` table) get
-- rejected by the database with "invalid input value for enum
-- pipeline_stage" even though the app already validates them against
-- `pipeline_stages` before writing (see src/app/api/leads/[id]/stage/route.ts
-- and src/app/api/leads/route.ts).
--
-- Fix: drop the enum constraint and let `pipeline_stages` be the only
-- source of truth, as it already is everywhere in the app code.
--
-- STEP 0 was run against production on 2026-08-15 and confirmed only
-- ONE column actually uses this enum: leads.estado_pipeline.
-- (stage_history.etapa is already plain text — no change needed there.)

-- ── STEP 0: discovery (read-only, safe to re-run anytime) ──────────────────
select table_name, column_name
from information_schema.columns
where udt_name = 'pipeline_stage';

-- Confirmed result (2026-08-15): leads.estado_pipeline only.


-- ── STEP 1: convert the column from enum to text ────────────────────────────
-- Run this whole block together.
--
-- Attempting this directly fails with "cannot alter type of a column used
-- in a trigger definition" — trigger_record_stage_change (which populates
-- stage_history) is defined as `AFTER UPDATE OF estado_pipeline`, which
-- Postgres treats as a column dependency regardless of whether the trigger
-- function actually cares about the column's type. Its function body
-- (record_stage_change) doesn't reference the enum type at all, so it's
-- safe to drop the trigger, do the alter, and recreate it identically.

begin;

drop trigger trigger_record_stage_change on public.leads;

alter table leads
  alter column estado_pipeline drop default;
alter table leads
  alter column estado_pipeline type text using estado_pipeline::text;
alter table leads
  alter column estado_pipeline set default 'lead_entrante';

create trigger trigger_record_stage_change
  after update of estado_pipeline on public.leads
  for each row execute function record_stage_change();

commit;


-- ── STEP 2: drop the now-unused enum type ───────────────────────────────────
-- Only run this AFTER re-running STEP 0 and confirming it returns zero rows.
-- Postgres will refuse to drop the type if anything still depends on it
-- (safe by default — this won't silently break something else).
--
-- Done — run against production on 2026-08-15, STEP 0 confirmed zero rows
-- first, this succeeded cleanly.

drop type pipeline_stage;


-- ── Rollback (if STEP 1 needs to be undone before STEP 2 runs) ─────────────
-- alter table leads alter column estado_pipeline type pipeline_stage using estado_pipeline::pipeline_stage;
