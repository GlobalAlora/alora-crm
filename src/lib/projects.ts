import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_SECTIONS = [
  { nombre: 'Por hacer',   color: '#94A3B8', position: 0, is_done: false },
  { nombre: 'En progreso', color: '#3B82F6', position: 1, is_done: false },
  { nombre: 'En revisión', color: '#F59E0B', position: 2, is_done: false },
  { nombre: 'Finalizado',  color: '#22C55E', position: 3, is_done: true  },
]

export async function createProjectForLead(
  admin: SupabaseClient,
  lead: { id: string; nombre: string | null; apellido: string | null; empresa: string | null },
  createdBy: string,
): Promise<string | null> {
  // Idempotent: return existing project if lead already has one
  const { data: existing } = await admin
    .from('projects')
    .select('id')
    .eq('lead_id', lead.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) return existing.id

  const nombre =
    lead.empresa?.trim() ||
    [lead.nombre, lead.apellido].filter(Boolean).join(' ') ||
    'Nuevo proyecto'

  const { data: project, error } = await admin
    .from('projects')
    .insert({
      nombre,
      estado: 'en_desarrollo',
      prioridad: 'media',
      lead_id: lead.id,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (error || !project) {
    console.error('[Projects] Failed to create project for lead', lead.id, error)
    return null
  }

  await admin.from('task_sections').insert(
    DEFAULT_SECTIONS.map(s => ({ ...s, project_id: project.id }))
  )

  return project.id
}
