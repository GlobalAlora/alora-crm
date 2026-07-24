-- ================================================================
-- Alora CRM — PM Backfill: crear proyectos para leads ganados
-- Ejecutar DESPUÉS de pm-migration.sql
-- Es idempotente: solo crea proyectos para leads que aún no tienen uno
-- ================================================================

WITH new_projects AS (
  INSERT INTO projects (nombre, estado, prioridad, lead_id)
  SELECT
    COALESCE(
      NULLIF(TRIM(l.empresa), ''),
      TRIM(COALESCE(l.nombre, '') ||
        CASE WHEN l.apellido IS NOT NULL AND l.apellido != ''
             THEN ' ' || l.apellido ELSE '' END),
      'Proyecto sin nombre'
    ) AS nombre,
    'en_desarrollo' AS estado,
    'media'         AS prioridad,
    l.id            AS lead_id
  FROM leads l
  WHERE l.estado_pipeline = 'cliente_ganado'
    AND l.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM projects p
      WHERE p.lead_id = l.id
        AND p.deleted_at IS NULL
    )
  RETURNING id, nombre
)
INSERT INTO task_sections (project_id, nombre, color, position, is_done)
SELECT
  p.id,
  s.nombre,
  s.color,
  s.position,
  s.is_done
FROM new_projects p
CROSS JOIN (VALUES
  ('Por hacer',   '#94A3B8', 0, false),
  ('En progreso', '#3B82F6', 1, false),
  ('En revisión', '#F59E0B', 2, false),
  ('Finalizado',  '#22C55E', 3, true)
) AS s(nombre, color, position, is_done);

-- Ver qué se creó
SELECT p.nombre AS proyecto, p.estado, l.empresa, l.nombre || ' ' || COALESCE(l.apellido,'') AS cliente
FROM projects p
JOIN leads l ON l.id = p.lead_id
WHERE l.deleted_at IS NULL
ORDER BY p.created_at DESC;
