-- Cobranza: client billing/fiscal details + lead association
--
-- The "Nuevo cliente" form had leftover invoice-document framing that
-- doesn't fit a client record: a single top-level "Vencimiento" date
-- (doesn't make sense for a client — each payment has its own) and an
-- "Ítems" line-item table (cantidad × precio) that duplicated what the
-- payment plan already expresses. Both dropped from the form; total is
-- now the sum of the client's payments instead of invoice_items.
--
-- Also missing: real fiscal/billing info (needed to actually prepare the
-- invoice in ARCA later) and a way to link the client record to an
-- existing Lead in the CRM instead of re-typing contact info.

-- ── STEP 0: discovery (read-only, safe to run anytime) ──────────────────
select count(*) from invoice_items;
-- Confirm nothing real depends on invoice_items before it goes unused.

-- ── STEP 1: add client billing/fiscal fields + lead link ────────────────
alter table invoices
  add column if not exists cliente_telefono text,
  add column if not exists cliente_razon_social text,
  add column if not exists cliente_cuit text,
  add column if not exists cliente_condicion_iva text
    check (cliente_condicion_iva in ('responsable_inscripto', 'monotributo', 'exento', 'consumidor_final')),
  add column if not exists cliente_domicilio text,
  add column if not exists lead_id uuid references leads(id) on delete set null;

create index if not exists idx_invoices_lead on invoices(lead_id);

-- invoice_items and the top-level invoices.fecha_vencimiento are left in
-- place (harmless if unused) — no data to migrate, nothing references
-- them going forward from the app.
