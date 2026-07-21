-- ──────────────────────────────────────────────────────────────────────────────
-- Limpieza de leads duplicados de WhatsApp
-- Correr en Supabase → SQL Editor
--
-- PASO 1: Ver qué se va a borrar ANTES de borrar (solo SELECT)
-- ──────────────────────────────────────────────────────────────────────────────

WITH normalized AS (
  SELECT
    id,
    nombre,
    telefono,
    created_at,
    fuente,
    last_activity_at,
    regexp_replace(telefono, '[^0-9]', '', 'g') AS tel_norm
  FROM leads
  WHERE deleted_at IS NULL
    AND telefono IS NOT NULL
    AND telefono != ''
),
groups AS (
  SELECT tel_norm
  FROM normalized
  GROUP BY tel_norm
  HAVING COUNT(*) > 1
),
ranked AS (
  SELECT
    n.id,
    n.nombre,
    n.telefono,
    n.fuente,
    n.created_at,
    n.last_activity_at,
    n.tel_norm,
    ROW_NUMBER() OVER (
      PARTITION BY n.tel_norm
      ORDER BY
        -- Prioridad 1: nombres reales antes que teléfonos como nombre
        CASE WHEN n.nombre ~ '^\+?[0-9]' THEN 1 ELSE 0 END ASC,
        -- Prioridad 2: el más antiguo (más historial) si hay empate
        n.created_at ASC
    ) AS rn
  FROM normalized n
  INNER JOIN groups g ON g.tel_norm = n.tel_norm
)
SELECT
  tel_norm,
  id,
  nombre,
  fuente,
  created_at,
  CASE WHEN rn = 1 THEN 'CONSERVAR' ELSE 'BORRAR' END AS accion
FROM ranked
ORDER BY tel_norm, rn;


-- ──────────────────────────────────────────────────────────────────────────────
-- PASO 2: Borrar los duplicados (soft-delete)
-- Solo correr DESPUÉS de revisar el paso 1 y confirmar que está bien
-- ──────────────────────────────────────────────────────────────────────────────

/*
WITH normalized AS (
  SELECT
    id,
    nombre,
    regexp_replace(telefono, '[^0-9]', '', 'g') AS tel_norm
  FROM leads
  WHERE deleted_at IS NULL
    AND telefono IS NOT NULL
    AND telefono != ''
),
groups AS (
  SELECT tel_norm
  FROM normalized
  GROUP BY tel_norm
  HAVING COUNT(*) > 1
),
ranked AS (
  SELECT
    n.id,
    ROW_NUMBER() OVER (
      PARTITION BY n.tel_norm
      ORDER BY
        CASE WHEN n.nombre ~ '^\+?[0-9]' THEN 1 ELSE 0 END ASC,
        n.created_at ASC
    ) AS rn
  FROM normalized n
  INNER JOIN groups g ON g.tel_norm = n.tel_norm
)
UPDATE leads
SET deleted_at = NOW()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
*/


-- ──────────────────────────────────────────────────────────────────────────────
-- PASO 3: Crear índice único para evitar futuros duplicados
-- Corre esto después del cleanup, también en SQL Editor
-- ──────────────────────────────────────────────────────────────────────────────

/*
CREATE UNIQUE INDEX IF NOT EXISTS leads_telefono_active_unique
  ON leads (telefono)
  WHERE deleted_at IS NULL
    AND telefono NOT LIKE 'test_%';
*/
