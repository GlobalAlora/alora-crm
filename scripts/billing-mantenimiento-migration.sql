-- Cobranza: tipo Proyecto vs Mantenimiento (recurrente)
--
-- A client's billing can be a one-time Proyecto (single payment or
-- installments, no recurrence — already supported) or an ongoing
-- Mantenimiento: same amount, same day of the month, indefinitely,
-- until the client cancels.

-- ── STEP 1: add recurrence fields to invoices ────────────────────────────
alter table invoices
  add column if not exists tipo_cobranza text not null default 'proyecto'
    check (tipo_cobranza in ('proyecto', 'recurrente')),
  add column if not exists dia_cobro int check (dia_cobro between 1 and 31),
  add column if not exists monto_recurrente numeric,
  add column if not exists mantenimiento_activo boolean not null default true;
