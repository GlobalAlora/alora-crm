import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * After any propuesta change, recalculate the lead's valor_propuesta_*
 * so the kanban card always reflects the latest proposal total.
 * Prefers USD if any USD propuesta exists; falls back to ARS.
 */
export async function syncLeadValorPropuesta(
  supabase: SupabaseClient,
  leadId: string
): Promise<void> {
  const { data: propuestas } = await supabase
    .from('propuestas')
    .select('valor_usd, valor_ars, moneda')
    .eq('lead_id', leadId)

  if (!propuestas || propuestas.length === 0) {
    await supabase
      .from('leads')
      .update({ valor_propuesta_usd: null, valor_propuesta_ars: null, valor_propuesta_moneda: null })
      .eq('id', leadId)
    return
  }

  const totalUSD = propuestas.reduce((sum, p) => sum + (p.valor_usd ?? 0), 0)
  const totalARS = propuestas.reduce((sum, p) => sum + (p.valor_ars ?? 0), 0)
  const hasUSD = propuestas.some((p) => p.moneda === 'USD' && (p.valor_usd ?? 0) > 0)

  if (hasUSD) {
    await supabase
      .from('leads')
      .update({ valor_propuesta_usd: totalUSD, valor_propuesta_ars: null, valor_propuesta_moneda: 'USD' })
      .eq('id', leadId)
  } else {
    await supabase
      .from('leads')
      .update({ valor_propuesta_usd: null, valor_propuesta_ars: totalARS, valor_propuesta_moneda: 'ARS' })
      .eq('id', leadId)
  }
}
