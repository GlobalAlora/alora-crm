import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TicketAttachment } from '@/types'

const PRIORIDAD_MAP: Record<string, string> = {
  baja: 'baja', media: 'media', alta: 'alta', urgente: 'urgente',
}

export async function createLinkedTask(
  ticket: {
    id: string; numero: string; titulo: string; prioridad: string; project_id: string
    attachments?: TicketAttachment[]
  },
  admin?: SupabaseClient
) {
  const db = admin ?? createAdminClient()

  const [{ data: sections }, { count }] = await Promise.all([
    db.from('task_sections')
      .select('id')
      .eq('project_id', ticket.project_id)
      .order('position', { ascending: true })
      .limit(1),
    db.from('project_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', ticket.project_id)
      .is('deleted_at', null),
  ])

  const sectionId = sections?.[0]?.id ?? null

  const descripcion =
    `Ticket de soporte vinculado automáticamente.\nNúmero: ${ticket.numero}` +
    (ticket.attachments?.length
      ? `\n\nArchivos adjuntos:\n${ticket.attachments.map(a => `- ${a.name}: ${a.url}`).join('\n')}`
      : '')

  const { data: task, error } = await db
    .from('project_tasks')
    .insert({
      project_id:  ticket.project_id,
      section_id:  sectionId,
      titulo:      `[${ticket.numero}] ${ticket.titulo}`,
      descripcion,
      prioridad:   PRIORIDAD_MAP[ticket.prioridad] ?? 'media',
      position:    (count ?? 0) + 1,
    })
    .select('id')
    .single()

  if (error || !task) return null

  await db
    .from('tickets')
    .update({ linked_task_id: task.id })
    .eq('id', ticket.id)

  return task.id
}
