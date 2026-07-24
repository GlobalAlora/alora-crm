import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

const PRIORIDAD_MAP: Record<string, string> = {
  baja: 'baja', media: 'media', alta: 'alta', urgente: 'urgente',
}

export async function createLinkedTask(
  ticket: {
    id: string; numero: string; titulo: string; prioridad: string; project_id: string
    attachments?: { url: string; name: string; type: string }[]
  },
  admin?: SupabaseClient
) {
  const db = admin ?? createAdminClient()

  // Get first section of the project (to place the task somewhere sensible)
  const { data: sections } = await db
    .from('task_sections')
    .select('id')
    .eq('project_id', ticket.project_id)
    .order('position', { ascending: true })
    .limit(1)

  const sectionId = sections?.[0]?.id ?? null

  // Current max position so the task goes to the end
  const { count } = await db
    .from('project_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', ticket.project_id)
    .is('deleted_at', null)

  const { data: task, error } = await db
    .from('project_tasks')
    .insert({
      project_id:  ticket.project_id,
      section_id:  sectionId,
      titulo:      `[${ticket.numero}] ${ticket.titulo}`,
      descripcion: [
        `Ticket de soporte vinculado automáticamente.`,
        `Número: ${ticket.numero}`,
        ...(ticket.attachments?.length
          ? [`\nArchivos adjuntos:\n${ticket.attachments.map(a => `- ${a.name}: ${a.url}`).join('\n')}`]
          : []),
      ].join('\n'),
      prioridad:   PRIORIDAD_MAP[ticket.prioridad] ?? 'media',
      position:    (count ?? 0) + 1,
    })
    .select('id')
    .single()

  if (error || !task) return null

  // Link the task back to the ticket
  await db
    .from('tickets')
    .update({ linked_task_id: task.id })
    .eq('id', ticket.id)

  return task.id
}
