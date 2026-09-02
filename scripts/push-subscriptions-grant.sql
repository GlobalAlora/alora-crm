-- push_subscriptions se creó en algún momento sin los permisos de acceso
-- que Supabase normalmente otorga solo. Resultado: cada intento de leer
-- (para mandar una notificación) o escribir (al activar notificaciones)
-- fallaba en silencio con "permission denied", así que ninguna
-- notificación de escritorio pudo funcionar nunca.
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions TO anon, authenticated, service_role;
