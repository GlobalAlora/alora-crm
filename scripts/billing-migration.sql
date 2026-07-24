-- ============================================================
-- BILLING MODULE — Facturas, Items, Cuotas
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── invoices ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID REFERENCES projects(id) ON DELETE SET NULL,
  numero            TEXT NOT NULL,
  cliente_nombre    TEXT NOT NULL,
  cliente_email     TEXT,
  descripcion       TEXT,
  moneda            TEXT NOT NULL DEFAULT 'USD'
                      CHECK (moneda IN ('USD','ARS')),
  estado            TEXT NOT NULL DEFAULT 'borrador'
                      CHECK (estado IN ('borrador','enviada','parcialmente_pagada','pagada','vencida','cancelada')),
  fecha_emision     DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  notas             TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_project  ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_estado   ON invoices(estado);
CREATE INDEX IF NOT EXISTS idx_invoices_created  ON invoices(created_at DESC);

-- ── invoice_items ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  descripcion      TEXT NOT NULL,
  cantidad         NUMERIC(10,2) NOT NULL DEFAULT 1,
  precio_unitario  NUMERIC(12,2) NOT NULL DEFAULT 0,
  position         INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- ── payments (cuotas) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  descripcion       TEXT NOT NULL DEFAULT 'Pago',
  monto             NUMERIC(12,2) NOT NULL,
  fecha_vencimiento DATE,
  fecha_pago        DATE,
  metodo_pago       TEXT CHECK (metodo_pago IN ('transferencia','efectivo','mercadopago','paypal','otro')),
  comprobante_url   TEXT,
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- ── updated_at trigger ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $fn$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────
ALTER TABLE invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments       ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoices' AND policyname='invoices_auth') THEN
    CREATE POLICY invoices_auth      ON invoices      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invoice_items' AND policyname='invoice_items_auth') THEN
    CREATE POLICY invoice_items_auth ON invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payments' AND policyname='payments_auth') THEN
    CREATE POLICY payments_auth      ON payments      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── GRANTs ────────────────────────────────────────────────
GRANT ALL ON TABLE invoices      TO anon, authenticated, service_role;
GRANT ALL ON TABLE invoice_items TO anon, authenticated, service_role;
GRANT ALL ON TABLE payments      TO anon, authenticated, service_role;
