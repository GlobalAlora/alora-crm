-- Recalculate valor_propuesta_* on all leads based on ACCEPTED proposals only.
-- Run this once in Supabase SQL Editor to fix leads that were inflated by
-- rejected/pending proposals before the propuestas-sync fix.

WITH accepted AS (
  -- Sum accepted proposals per lead, grouped by currency preference
  SELECT
    lead_id,
    SUM(CASE WHEN moneda = 'USD' THEN COALESCE(valor_usd, 0) ELSE 0 END) AS total_usd,
    SUM(CASE WHEN moneda = 'ARS' THEN COALESCE(valor_ars, 0) ELSE 0 END) AS total_ars,
    BOOL_OR(moneda = 'USD' AND COALESCE(valor_usd, 0) > 0)              AS has_usd
  FROM public.propuestas
  WHERE estado = 'aceptada'
  GROUP BY lead_id
),
computed AS (
  -- For each lead with accepted proposals, determine final values
  SELECT
    lead_id,
    CASE WHEN has_usd THEN total_usd  ELSE NULL  END AS valor_propuesta_usd,
    CASE WHEN has_usd THEN NULL       ELSE total_ars END AS valor_propuesta_ars,
    CASE WHEN has_usd THEN 'USD'      ELSE 'ARS'  END AS valor_propuesta_moneda
  FROM accepted
)
-- Update leads that have at least one accepted proposal
UPDATE public.leads l
SET
  valor_propuesta_usd    = c.valor_propuesta_usd,
  valor_propuesta_ars    = c.valor_propuesta_ars,
  valor_propuesta_moneda = c.valor_propuesta_moneda
FROM computed c
WHERE l.id = c.lead_id;

-- Zero-out leads whose only proposals are rejected/pending (no accepted ones).
-- valor_propuesta_moneda has a NOT NULL constraint, so we use 'ARS' as a safe
-- default — the amounts are NULL so the currency is irrelevant.
UPDATE public.leads
SET
  valor_propuesta_usd    = NULL,
  valor_propuesta_ars    = NULL,
  valor_propuesta_moneda = 'ARS'
WHERE id IN (
  -- Leads that have propuestas but NONE are accepted
  SELECT DISTINCT lead_id FROM public.propuestas
  EXCEPT
  SELECT DISTINCT lead_id FROM public.propuestas WHERE estado = 'aceptada'
);
