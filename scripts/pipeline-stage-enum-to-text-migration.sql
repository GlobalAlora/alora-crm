-- Pipeline stage: convert from fixed Postgres enum to free text
--
-- Problem: `estado_pipeline` (and `stage_history.etapa`) are typed as the
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
-- Run STEP 0 first and read the output before doing anything else — it
-- finds every column using this enum so nothing gets missed. The two
-- columns below (leads.estado_pipeline, stage_history.etapa) are the ones
-- visible from the application code, but there may be others (e.g. in
-- views, or tables not touched by this app).

-- ── STEP 0: discovery (read-only, safe to run anytime) ─────────────────────
select table_name, column_name
from information_schema.columns
where udt_name = 'pipeline_stage';

-- Expected result: leads.estado_pipeline and stage_history.etapa.
-- If anything else shows up, add it to STEP 1 below before proceeding.


-- ── STEP 1: convert columns from enum to text ───────────────────────────────
-- Run this whole block together.

begin;

alter table leads
  alter column estado_pipeline drop default;
alter table leads
  alter column estado_pipeline type text using estado_pipeline::text;
alter table leads
  alter column estado_pipeline set default 'lead_entrante';

alter table stage_history
  alter column etapa type text using etapa::text;

commit;


-- ── STEP 2: drop the now-unused enum type ───────────────────────────────────
-- Only run this AFTER re-running STEP 0 and confirming it returns zero rows.
-- Postgres will refuse to drop the type if anything still depends on it
-- (safe by default — this won't silently break something else).

-- drop type pipeline_stage;


-- ── Rollback (if STEP 1 needs to be undone before STEP 2 runs) ─────────────
-- alter table leads alter column estado_pipeline type pipeline_stage using estado_pipeline::pipeline_stage;
-- alter table stage_history alter column etapa type pipeline_stage using etapa::pipeline_stage;
