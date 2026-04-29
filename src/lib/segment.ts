import type { SupabaseClient } from '@supabase/supabase-js'
import type { SegmentFilters } from '@/types'

export interface SegmentedLead {
  id: string
  nombre: string
  apellido: string | null
  email: string | null
  empresa: string | null
  estado_pipeline: string
}

/**
 * Returns leads matching the given segment filters.
 * Used by campaign preview and send.
 */
export async function getLeadsByFilters(
  supabase: SupabaseClient,
  filters: SegmentFilters
): Promise<SegmentedLead[]> {
  // If list_ids is specified, start from list_leads
  if (filters.list_ids && filters.list_ids.length > 0) {
    const { data, error } = await supabase
      .from('list_leads')
      .select('lead:leads(id, nombre, apellido, email, empresa, estado_pipeline)')
      .in('list_id', filters.list_ids)

    if (error) throw new Error(error.message)

    const leads = (data ?? [])
      .flatMap((r) => (Array.isArray(r.lead) ? r.lead : [r.lead]))
      .filter((l): l is SegmentedLead => !!l && !!l.email)
    return leads
  }

  // Base query on leads
  let query = supabase
    .from('leads')
    .select('id, nombre, apellido, email, empresa, estado_pipeline')
    .is('deleted_at', null)
    .not('email', 'is', null)

  if (filters.estado_pipeline && filters.estado_pipeline.length > 0) {
    query = query.in('estado_pipeline', filters.estado_pipeline)
  }

  if (filters.paises && filters.paises.length > 0) {
    query = query.in('pais', filters.paises)
  }

  if (filters.responsable_ids && filters.responsable_ids.length > 0) {
    query = query.in('responsable_id', filters.responsable_ids)
  }

  if (filters.servicios_interesados && filters.servicios_interesados.length > 0) {
    query = query.overlaps('servicios_interesados', filters.servicios_interesados)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  let leads = (data ?? []) as SegmentedLead[]

  // Tag filter: post-filter since it requires a join
  if (filters.tag_ids && filters.tag_ids.length > 0) {
    const { data: tagRels } = await supabase
      .from('lead_tag_relations')
      .select('lead_id')
      .in('tag_id', filters.tag_ids)

    const taggedLeadIds = new Set((tagRels ?? []).map((r) => r.lead_id))
    leads = leads.filter((l) => taggedLeadIds.has(l.id))
  }

  return leads
}
