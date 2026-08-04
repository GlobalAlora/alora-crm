import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTaskAssignmentEmail } from '@/lib/task-emails'
import { notifyUser } from '@/lib/push-notify'
import { createTaskNotification } from '@/lib/task-notify'
import type { PmPriority, ProjectTaskEstado } from '@/types'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('project_tasks')
    .select('*')
    .eq('project_id', id)
    .is('deleted_at', null)
    .is('parent_task_id', null)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as Record<string, unknown>

  if (!body.titulo || typeof body.titulo !== 'string' || !body.titulo.trim()) {
    return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Get max position in section to place new task at the end
  const { data: maxRow } = await admin
    .from('project_tasks')
    .select('position')
    .eq('project_id', id)
    .eq('section_id', body.section_id as string)
    .is('deleted_at', null)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await admin
    .from('project_tasks')
    .insert({
      project_id:      id,
      section_id:      body.section_id      || null,
      parent_task_id:  body.parent_task_id  || null,
      titulo:          (body.titulo as string).trim(),
      descripcion:     body.descripcion     || null,
      estado:          (body.estado as ProjectTaskEstado) || 'pendiente',
      prioridad:       (body.prioridad as PmPriority)     || 'media',
      assignee_id:     body.assignee_id     || null,
      fecha_inicio:    body.fecha_inicio    || null,
      fecha_limite:    body.fecha_limite    || null,
      horas_estimadas: body.horas_estimadas ? Number(body.horas_estimadas) : null,
      position:        (maxRow?.position ?? 0) + 1,
      created_by:      user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify assignee if task was created with one already set
  if (data.assignee_id) {
    // Email only when someone else creates the assignment
    if (data.assignee_id !== user.id) {
      sendTaskAssignmentEmail({
        admin,
        assigneeId: data.assignee_id,
        creatorId:  user.id,
        task: {
          titulo:       data.titulo,
          descripcion:  data.descripcion,
          prioridad:    data.prioridad,
          fecha_limite: data.fecha_limite,
          project_id:   id,
        },
      }).catch((e) => console.error('[task-email] ERROR:', e))
    }

    // Bell + push always (including self-assign)
    notifyUser(data.assignee_id, {
      title: '📋 Nueva tarea asignada',
      body:  data.titulo,
      url:   `/projects/${id}`,
    }).catch((e) => console.error('[push] task create ERROR:', e))

    createTaskNotification(admin, {
      userId:     data.assignee_id,
      taskId:     data.id,
      projectId:  id,
      taskTitulo: data.titulo,
    }).catch((e) => console.error('[task-notif] ERROR:', e))
  }

  return NextResponse.json({ data }, { status: 201 })
}
