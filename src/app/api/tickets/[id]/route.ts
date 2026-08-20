import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/ticket-task'
import { sendGmail } from '@/lib/google-gmail'
import { PORTAL_URL, buildStatusChangeHtml, buildHorasEstimadasHtml, buildCsatEmailHtml } from '@/lib/ticket-emails'
const INTERNAL_EMAIL = 'somosglobalalora@gmail.com'

const ALLOWED_ROLES = ['admin', 'sales']
type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { data: ticket, error } = await admin
    .from('tickets')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  const userIds = [ticket.assignee_id, ticket.created_by].filter(Boolean) as string[]

  const [projectRes, leadRes, usersRes, commentsRes] = await Promise.all([
    ticket.project_id
      ? admin.from('projects').select('id,nombre,color').eq('id', ticket.project_id).maybeSingle()
      : { data: null },
    ticket.lead_id
      ? admin.from('leads').select('id,nombre,apellido,empresa').eq('id', ticket.lead_id).maybeSingle()
      : { data: null },
    userIds.length
      ? admin.from('users').select('id,full_name,avatar_url').in('id', userIds)
      : { data: [] },
    admin
      .from('ticket_comments')
      .select('*')
      .eq('ticket_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
  ])

  const userMap = Object.fromEntries((usersRes.data ?? []).map(u => [u.id, u]))

  const commentUserIds = [...new Set((commentsRes.data ?? []).map(c => c.user_id).filter(Boolean))] as string[]
  let commentUserMap: Record<string, { id: string; full_name: string; avatar_url: string | null }> = {}
  if (commentUserIds.length) {
    const { data: cUsers } = await admin
      .from('users')
      .select('id,full_name,avatar_url')
      .in('id', commentUserIds)
    commentUserMap = Object.fromEntries((cUsers ?? []).map(u => [u.id, u]))
  }

  const comments = (commentsRes.data ?? []).map(c => ({
    ...c,
    user: c.user_id ? commentUserMap[c.user_id] ?? null : null,
  }))

  const lastTeamReplyAt = comments
    .filter(c => !c.is_client && c.created_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.created_at ?? null

  return NextResponse.json({
    data: {
      ...ticket,
      project:           projectRes.data ?? null,
      lead:              leadRes.data ?? null,
      assignee:          ticket.assignee_id ? userMap[ticket.assignee_id] ?? null : null,
      creator:           ticket.created_by  ? userMap[ticket.created_by]  ?? null : null,
      comments,
      last_team_reply_at: lastTeamReplyAt,
    },
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json() as Record<string, unknown>
  const ALLOWED = ['titulo', 'descripcion', 'estado', 'prioridad', 'categoria', 'project_id', 'lead_id', 'assignee_id', 'resolved_at', 'horas_estimadas', 'horas_reales']
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key] ?? null
  }

  if ('estado' in updates && (updates.estado === 'resuelto' || updates.estado === 'cerrado') && !updates.resolved_at) {
    updates.resolved_at = new Date().toISOString()
  }
  if ('estado' in updates && updates.estado !== 'resuelto' && updates.estado !== 'cerrado') {
    updates.resolved_at = null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  // Load current ticket before updating
  const { data: current } = await admin
    .from('tickets')
    .select('numero,titulo,prioridad,project_id,linked_task_id,attachments,estado,client_email,client_nombre,ticket_token,horas_estimadas')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  const { data, error } = await admin
    .from('tickets')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Email client on status change (only for portal clients with email)
  const NOTIFY_STATES = ['en_progreso', 'en_espera', 'estimacion', 'resuelto', 'cerrado']
  const nuevoEstado = updates.estado as string | undefined
  if (nuevoEstado && nuevoEstado !== current?.estado && NOTIFY_STATES.includes(nuevoEstado) && current?.client_email && current?.ticket_token) {
    sendGmail({
      from:    'info@globalalora.com',
      to:      current.client_email,
      subject: `[${current.numero}] Tu ticket fue actualizado`,
      html:    buildStatusChangeHtml({
        numero:       current.numero,
        titulo:       current.titulo,
        client_nombre: current.client_nombre,
        nuevo_estado: nuevoEstado,
        trackingUrl:  `${PORTAL_URL}/${current.ticket_token}`,
      }),
    }).catch(() => {})
  }

  // CSAT email when ticket is resolved or closed
  if (nuevoEstado && (nuevoEstado === 'resuelto' || nuevoEstado === 'cerrado') && nuevoEstado !== current?.estado && current?.client_email && current?.ticket_token) {
    sendGmail({
      from:    'info@globalalora.com',
      to:      current.client_email,
      subject: `[${current.numero}] ¿Cómo fue tu experiencia?`,
      html:    buildCsatEmailHtml({
        numero:          current.numero,
        titulo:          current.titulo,
        client_nombre:   current.client_nombre,
        thumbsUpUrl:     `${PORTAL_URL}/api/portal/tickets/${current.ticket_token}/csat?score=1`,
        thumbsDownUrl:   `${PORTAL_URL}/api/portal/tickets/${current.ticket_token}/csat?score=0`,
      }),
    }).catch(() => {})
  }

  // Auto-set estado to estimacion when hours are first estimated
  const nuevasHoras = updates.horas_estimadas as number | null | undefined
  if (nuevasHoras != null && nuevasHoras > 0 && nuevasHoras !== current?.horas_estimadas) {
    void Promise.resolve(admin.from('tickets').update({ estado: 'estimacion' }).eq('id', id))
  }

  if (nuevasHoras != null && nuevasHoras > 0 && nuevasHoras !== current?.horas_estimadas && current?.client_email && current?.ticket_token) {
    sendGmail({
      from:    'info@globalalora.com',
      to:      current.client_email,
      subject: `[${current.numero}] Alora estimó ${nuevasHoras} hs para tu ticket`,
      html:    buildHorasEstimadasHtml({
        numero:           current.numero,
        titulo:           current.titulo,
        client_nombre:    current.client_nombre,
        horas_estimadas:  nuevasHoras,
        trackingUrl:      `${PORTAL_URL}/${current.ticket_token}`,
      }),
    }).catch(() => {})
    // Reset approval when hours change
    void Promise.resolve(admin.from('tickets').update({ horas_aprobadas: false }).eq('id', id))
  }

  // Auto-create task when project is newly assigned and no task exists yet
  const newProjectId = updates.project_id as string | undefined | null
  const hadNoProject   = !current?.project_id
  const hadNoTask      = !current?.linked_task_id
  if (newProjectId && (hadNoProject || current?.project_id !== newProjectId) && hadNoTask) {
    createLinkedTask({
      id,
      numero:      current?.numero ?? '',
      titulo:      (updates.titulo as string | undefined) ?? current?.titulo ?? '',
      prioridad:   (updates.prioridad as string | undefined) ?? current?.prioridad ?? 'media',
      project_id:  newProjectId,
      attachments: (current?.attachments as { url: string; name: string; type: string }[] | null) ?? [],
    }, admin).catch(() => {})
  }

  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { error } = await admin
    .from('tickets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
