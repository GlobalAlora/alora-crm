import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { buildTaskAssignedHtml } from '@/lib/task-emails'
import type { PmPriority, ProjectTaskEstado } from '@/types'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as Record<string, unknown>
  const ALLOWED = ['titulo', 'descripcion', 'estado', 'prioridad', 'section_id', 'assignee_id', 'fecha_inicio', 'fecha_limite', 'horas_estimadas', 'position']
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

  // Fetch current task to detect assignee change
  const { data: currentTask } = await admin
    .from('project_tasks')
    .select('assignee_id, titulo, descripcion, prioridad, fecha_limite, project_id')
    .eq('id', id)
    .maybeSingle()

  const { data, error } = await admin
    .from('project_tasks')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send assignment email if assignee changed and is not the person making the change
  const newAssigneeId = updates.assignee_id as string | null
  const assigneeChanged = newAssigneeId &&
    newAssigneeId !== currentTask?.assignee_id &&
    newAssigneeId !== user.id

  console.log('[task-email] assigneeChanged:', assigneeChanged, '| currentTask:', !!currentTask, '| newAssigneeId:', newAssigneeId, '| user.id:', user.id)

  if (newAssigneeId && newAssigneeId !== user.id) {
    const projectId = currentTask?.project_id ?? (data.project_id as string)
    sendAssignmentEmail({
      admin,
      assigneeId: newAssigneeId,
      task: {
        titulo:       data.titulo,
        descripcion:  data.descripcion,
        prioridad:    data.prioridad,
        fecha_limite: data.fecha_limite,
        project_id:   projectId,
      },
    }).catch((e) => console.error('[task-email] ERROR:', e))
  }

  return NextResponse.json({ data })
}

async function sendAssignmentEmail(opts: {
  admin: ReturnType<typeof createAdminClient>
  assigneeId: string
  task: { titulo: string; descripcion: string | null; prioridad: string; fecha_limite: string | null; project_id: string }
}) {
  const { admin, assigneeId, task } = opts

  const [{ data: assignee, error: assigneeErr }, { data: project, error: projectErr }] = await Promise.all([
    admin.from('users').select('email, full_name').eq('id', assigneeId).maybeSingle(),
    admin.from('projects').select('nombre').eq('id', task.project_id).maybeSingle(),
  ])

  console.log('[task-email] assignee:', JSON.stringify(assignee), 'err:', assigneeErr?.message)
  console.log('[task-email] project:', JSON.stringify(project), 'err:', projectErr?.message)

  // Fallback: public.users might not have email — try auth.users
  let resolvedEmail = assignee?.email
  let resolvedName = assignee?.full_name
  if (!resolvedEmail) {
    const { data: authUser } = await admin.auth.admin.getUserById(assigneeId)
    resolvedEmail = authUser?.user?.email
    resolvedName = resolvedName ?? authUser?.user?.user_metadata?.full_name ?? authUser?.user?.email
    console.log('[task-email] auth.users fallback email:', resolvedEmail)
  }

  if (!resolvedEmail || !project?.nombre) {
    console.log('[task-email] SKIP — missing email or project name. assigneeId:', assigneeId, 'project_id:', task.project_id)
    return
  }

  console.log('[task-email] SENDING to:', resolvedEmail)
  await sendGmail({
    from:    'info@globalalora.com',
    to:      resolvedEmail,
    toName:  resolvedName,
    subject: `Nueva tarea asignada: ${task.titulo}`,
    html: buildTaskAssignedHtml({
      assigneeName: resolvedName ?? resolvedEmail,
      taskTitle:    task.titulo,
      projectName:  project.nombre,
      prioridad:    task.prioridad,
      descripcion:  task.descripcion,
      fechaLimite:  task.fecha_limite,
      projectUrl:   `https://alora-crm.vercel.app/projects/${task.project_id}`,
    }),
  })
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
