-- Marca el origen del ticket ('lidia' = creado por LIDIA desde WhatsApp).
-- Opcional: el CRM funciona sin correrla (usa el marcador de la descripcion como respaldo).
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS origen TEXT;
