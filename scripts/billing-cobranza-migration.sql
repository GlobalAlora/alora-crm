-- Cobranza rework: per-payment invoice tracking + document uploads,
-- and drop the invoice-document-lifecycle states (borrador/enviada) in
-- favor of collection-status states.
--
-- Context: "Facturación" never generated real tax invoices (those are
-- made in ARCA separately) — it tracks clients and their payment plans.
-- The old states mixed "was the document sent" with "was the money
-- collected", which don't apply here. New states talk about money only:
-- pendiente / parcial / cobrado / vencido / cancelada.
--
-- The invoice number itself (per payment, filled in once that payment's
-- real tax invoice is issued in ARCA) is new — added to `payments`, not
-- `invoices`, since a single client's payment plan can span several
-- separate real invoices over time.

-- ── STEP 0: discovery (read-only, safe to run anytime) ──────────────────
select estado, count(*) from invoices where deleted_at is null group by estado;
select count(*) from payments where comprobante_url is not null;

-- Confirmed 2026-08-17: 1 invoice (borrador, test data), 0 payments with
-- comprobante_url set (that field never had UI, safe to drop below).


-- ── STEP 1: payments — add per-payment invoice tracking + documents ─────
alter table payments
  add column if not exists numero_factura text,
  add column if not exists factura_enviada_at timestamptz,
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table payments
  drop column if exists comprobante_url;


-- ── STEP 2: invoices — migrate estado values ─────────────────────────────
-- Run as one transaction: drop the old CHECK, remap existing rows, add
-- the new CHECK, change the default.

begin;

alter table invoices drop constraint if exists invoices_estado_check;

update invoices set estado = case estado
  when 'borrador'             then 'pendiente'
  when 'enviada'               then 'pendiente'
  when 'parcialmente_pagada'   then 'parcial'
  when 'pagada'                then 'cobrado'
  when 'vencida'                then 'vencido'
  else estado  -- 'cancelada' stays as-is
end;

alter table invoices
  add constraint invoices_estado_check
  check (estado in ('pendiente', 'parcial', 'cobrado', 'vencido', 'cancelada'));

alter table invoices alter column estado set default 'pendiente';

commit;
