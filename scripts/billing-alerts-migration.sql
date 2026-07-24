-- ============================================================
-- BILLING ALERTS — Columnas para seguimiento de alertas
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Fecha en que se envió el último recordatorio por cuota
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS alerta_enviada_at TIMESTAMPTZ;

-- Toggle para activar/desactivar alertas automáticas por factura
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS alertas_activas BOOLEAN NOT NULL DEFAULT true;

-- Días de anticipación para el recordatorio (default: 3)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS dias_alerta INT NOT NULL DEFAULT 3;
