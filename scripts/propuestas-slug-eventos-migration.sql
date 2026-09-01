-- Slug legible para el link público de la propuesta (en vez del UUID crudo)
ALTER TABLE propuestas ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Eventos de la propuesta pública: vista (cada vez que se abre el link),
-- aceptar (click en "Aceptar propuesta") y dudas (click en "Tengo dudas") --
-- para poder ver cuántas veces se abrió y qué acción tomó el cliente.
CREATE TABLE IF NOT EXISTS propuesta_eventos (
  id uuid primary key default gen_random_uuid(),
  propuesta_id uuid not null references propuestas(id) on delete cascade,
  tipo text not null check (tipo in ('vista', 'aceptar', 'dudas', 'contacto')),
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS propuesta_eventos_propuesta_id_idx ON propuesta_eventos(propuesta_id);
