-- ============================================================
-- Función para buscar leads por teléfono normalizado
-- Resuelve el problema de teléfonos guardados con formatos
-- distintos (+54 9 3772 63-4401 vs 5493772634401)
-- ============================================================

CREATE OR REPLACE FUNCTION find_lead_by_normalized_phone(p_phone TEXT)
RETURNS TABLE(id UUID, nombre TEXT, estado_pipeline TEXT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id, nombre, estado_pipeline
  FROM leads
  WHERE REGEXP_REPLACE(telefono, '[^0-9]', '', 'g') = REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g')
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION find_lead_by_normalized_phone(TEXT) TO anon, authenticated, service_role;
