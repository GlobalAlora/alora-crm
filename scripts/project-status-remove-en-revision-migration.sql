-- Project status: remove "en_revision" — not a valid project-level state
--
-- Problem: projects.estado uses the Postgres enum project_status_pm with
-- 5 values ('pendiente', 'en_desarrollo', 'en_revision', 'en_pausa',
-- 'finalizado'). "en_revision" doesn't make sense at the project level —
-- it's a task-level concept (project_task_status, a SEPARATE enum used by
-- project_tasks.estado, is untouched by this script — tasks keep
-- "en_revision").
--
-- Confirmed via the app's service_role key on 2026-08-15: zero projects
-- currently have estado = 'en_revision', so this is a clean removal with
-- no data to remap.

-- ── STEP 0: discovery (read-only, safe to run anytime) ──────────────────
-- Confirms no project is currently in the state being removed, and that
-- no trigger is defined specifically "OF estado" (which would need
-- dropping/recreating like we hit with the leads pipeline migration).
select estado, count(*) from projects where deleted_at is null group by estado;

select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'projects'::regclass and not tgisinternal;

-- Expected: no row with estado = 'en_revision', and no trigger definition
-- containing "OF estado" (projects_updated_at is a plain BEFORE UPDATE,
-- not column-specific, so it won't block the alter below).


-- ── STEP 1: rebuild the enum without en_revision ─────────────────────────
-- Postgres can't remove a single value from an existing enum, so this
-- creates a new type with the 4 valid values, swaps the column over, then
-- drops the old type and renames the new one into its place.

begin;

create type project_status_pm_new as enum ('pendiente', 'en_desarrollo', 'en_pausa', 'finalizado');

alter table projects
  alter column estado drop default;
alter table projects
  alter column estado type project_status_pm_new using estado::text::project_status_pm_new;
alter table projects
  alter column estado set default 'pendiente';

drop type project_status_pm;
alter type project_status_pm_new rename to project_status_pm;

commit;

-- If this fails with "invalid input value" it means some project IS in
-- en_revision after all — stop and decide what state to move it to first
-- (e.g. `update projects set estado = 'en_desarrollo' where estado =
-- 'en_revision'`) before retrying.


-- ── Rollback (if needed before committing further changes) ─────────────
-- create type project_status_pm_old as enum ('pendiente', 'en_desarrollo', 'en_revision', 'en_pausa', 'finalizado');
-- alter table projects alter column estado drop default;
-- alter table projects alter column estado type project_status_pm_old using estado::text::project_status_pm_old;
-- alter table projects alter column estado set default 'pendiente';
-- drop type project_status_pm;
-- alter type project_status_pm_old rename to project_status_pm;
