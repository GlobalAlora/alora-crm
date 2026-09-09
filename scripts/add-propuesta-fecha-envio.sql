-- Cada propuesta necesita su PROPIA fecha real de envío -- hasta ahora solo
-- existía leads.fecha_propuesta (una por LEAD, no por propuesta), que no
-- alcanza cuando un lead tiene más de una propuesta en distintos meses (una
-- rechazada, otra nueva). Con esta columna, cada fila de `propuestas` sabe
-- en qué período cae de verdad, sin depender de una sola fecha compartida
-- ni del created_at de la fila (poco confiable para propuestas viejas
-- cargadas/migradas después, como ya se documentó para leads.fecha_propuesta).
-- Correr en el SQL Editor de Supabase.

alter table propuestas add column if not exists fecha_envio timestamptz;

create index if not exists propuestas_fecha_envio_idx on propuestas(fecha_envio);
