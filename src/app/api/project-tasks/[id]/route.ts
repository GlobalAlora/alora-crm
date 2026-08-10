import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTaskAssignmentEmail } from '@/lib/task-emails'
import { notifyUser } from '@/lib/push-notify'
import { createTaskNotification } from '@/lib/task-notify'
import type { PmPriority, ProjectTaskEstado } from '@/types'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as Record<string, unknown>
  const ALLOWED = ['titulo', 'descripcion', 'estado', 'prioridad', 'section_id', 'assignee_id', 'fecha_inicio', 'fecha_limite', 'fecha_finalizacion', 'horas_estimadas', 'position']
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key] ?? null
  }
  if ('attachments' in body && Array.isArray(body.attachments)) {
    updates.attachments = body.attachments
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch current task to detect estado/assignee change
  const { data: currentTask } = await admin
    .from('project_tasks')
    .select('assignee_id, titulo, descripcion, prioridad, fecha_limite, project_id, estado, fecha_finalizacion')
    .eq('id', id)
    .maybeSingle()

  // Auto-set fecha_finalizacion when marking as finalizada
  if ('estado' in updates) {
    if (updates.estado === 'finalizada' && !currentTask?.fecha_finalizacion && !('fecha_finalizacion' in updates)) {
      updates.fecha_finalizacion = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    } else if (updates.estado !== 'finalizada' && currentTask?.estado === 'finalizada' && !('fecha_finalizacion' in updates)) {
      updates.fecha_finalizacion = null
    }
  }

  const { data, error } = await admin
    .from('project_tasks')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify when assignee actually changes
  const newAssigneeId   = updates.assignee_id as string | null
  const assigneeChanged = newAssigneeId && newAssigneeId !== currentTask?.assignee_id

  if (assigneeChanged) {
    const projectId = currentTask?.project_id ?? (data.project_id as string)

    // Email only when someone else assigns (not self-assign)
    if (newAssigneeId !== user.id) {
      sendTaskAssignmentEmail({
        admin,
        assigneeId: newAssigneeId,
        creatorId:  user.id,
        task: {
          titulo:       data.titulo,
          descripcion:  data.descripcion,
          prioridad:    data.prioridad,
          fecha_limite: data.fecha_limite,
          project_id:   projectId,
        },
      }).catch((e) => console.error('[task-email] ERROR:', e))
    }

    // Bell + push always when assignee changes (including self-assign)
    notifyUser(newAssigneeId, {
      title: '📋 Nueva tarea asignada',
      body:  data.titulo,
      url:   `/projects/${projectId}`,
    }).catch((e) => console.error('[push] task assign ERROR:', e))

    createTaskNotification(admin, {
      userId:     newAssigneeId,
      taskId:     id,
      projectId,
      taskTitulo: data.titulo,
    }).catch((e) => console.error('[task-notif] ERROR:', e))
  }

  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('project_tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
