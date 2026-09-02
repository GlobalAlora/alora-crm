-- ============================================================
-- Función para buscar leads por teléfono normalizado
-- Resuelve el problema de teléfonos guardados con formatos
-- distintos (+54 9 3772 63-4401 vs 5493772634401)
--
-- v2: además de sacar todo lo que no sea dígito, compara por los
-- ÚLTIMOS 10 dígitos en vez de exigir igualdad exacta. Sin esto, un
-- número guardado sin código de país (ej. "2612067914", como llega
-- de una reserva de calendario) nunca matcheaba contra el mismo
-- número guardado en formato WhatsApp completo con código de país +
-- el 9 de celular argentino ("5492612067914") -- son igual de
-- válidos, pero como STRINGS tienen longitud distinta, así que la
-- comparación exacta anterior jamás los iba a unir. Esto causaba
-- leads duplicados: uno se cierra/pierde, la misma persona escribe
-- de nuevo por WhatsApp con el número "completo" y como no matchea
-- se crea un lead nuevo en vez de reabrir el existente.
-- ============================================================

CREATE OR REPLACE FUNCTION find_lead_by_normalized_phone(p_phone TEXT)
RETURNS TABLE(id UUID, nombre TEXT, estado_pipeline TEXT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id, nombre, estado_pipeline
  FROM leads
  WHERE length(regexp_replace(p_phone, '[^0-9]', '', 'g')) >= 8
    AND right(regexp_replace(telefono, '[^0-9]', '', 'g'), 10) = right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 10)
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION find_lead_by_normalized_phone(TEXT) TO anon, authenticated, service_role;
