import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/ticket-task'
import type { TicketEstado, TicketPrioridad, TicketCategoria } from '@/types'

const ALLOWED_ROLES = ['admin', 'sales']

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const estado      = sp.get('estado') as TicketEstado | null
  const prioridad   = sp.get('prioridad') as TicketPrioridad | null
  const categoria   = sp.get('categoria') as TicketCategoria | null
  const assignee_id = sp.get('assignee_id')
  const project_id  = sp.get('project_id')

  let q = admin
    .from('tickets')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (estado)      q = q.eq('estado', estado)
  if (prioridad)   q = q.eq('prioridad', prioridad)
  if (categoria)   q = q.eq('categoria', categoria)
  if (assignee_id) q = q.eq('assignee_id', assignee_id)
  if (project_id)  q = q.eq('project_id', project_id)

  const { data: tickets, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with project, lead, assignee, creator
  const projectIds  = [...new Set(tickets.map(t => t.project_id).filter(Boolean))]
  const leadIds     = [...new Set(tickets.map(t => t.lead_id).filter(Boolean))]
  const userIds     = [...new Set([
    ...tickets.map(t => t.assignee_id),
    ...tickets.map(t => t.created_by),
  ].filter(Boolean))]

  const [projectsRes, leadsRes, usersRes, commentsRes] = await Promise.all([
    projectIds.length
      ? admin.from('projects').select('id,nombre,color').in('id', projectIds as string[])
      : { data: [] },
    leadIds.length
      ? admin.from('leads').select('id,nombre,apellido,empresa').in('id', leadIds as string[])
      : { data: [] },
    userIds.length
      ? admin.from('users').select('id,full_name,avatar_url').in('id', userIds as string[])
      : { data: [] },
    admin
      .from('ticket_comments')
      .select('ticket_id, created_at, is_client')
      .in('ticket_id', tickets.map(t => t.id))
      .order('created_at', { ascending: false }),
  ])

  const projectMap = Object.fromEntries((projectsRes.data ?? []).map(p => [p.id, p]))
  const leadMap    = Object.fromEntries((leadsRes.data ?? []).map(l => [l.id, l]))
  const userMap    = Object.fromEntries((usersRes.data ?? []).map(u => [u.id, u]))

  const commentCounts:    Record<string, number> = {}
  const lastTeamReplyAt:  Record<string, string> = {}
  for (const c of commentsRes.data ?? []) {
    commentCounts[c.ticket_id] = (commentCounts[c.ticket_id] ?? 0) + 1
    if (!c.is_client && !lastTeamReplyAt[c.ticket_id]) {
      lastTeamReplyAt[c.ticket_id] = c.created_at
    }
  }

  const enriched = tickets.map(t => ({
    ...t,
    project:           t.project_id  ? projectMap[t.project_id]  ?? null : null,
    lead:              t.lead_id     ? leadMap[t.lead_id]         ?? null : null,
    assignee:          t.assignee_id ? userMap[t.assignee_id]     ?? null : null,
    creator:           t.created_by  ? userMap[t.created_by]      ?? null : null,
    comments_count:    commentCounts[t.id]   ?? 0,
    last_team_reply_at: lastTeamReplyAt[t.id] ?? null,
  }))

  return NextResponse.json({ data: enriched })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json() as {
    titulo: string
    descripcion?: string
    prioridad?: TicketPrioridad
    categoria?: TicketCategoria
    project_id?: string
    lead_id?: string
    assignee_id?: string
  }

  if (!body.titulo?.trim()) {
    return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })
  }

  // Auto-number TICK-YYYY-NNN
  const year = new Date().getFullYear()
  const { count } = await admin
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .like('numero', `TICK-${year}-%`)
  const seq    = (count ?? 0) + 1
  const numero = `TICK-${year}-${String(seq).padStart(3, '0')}`

  const { data, error } = await admin
    .from('tickets')
    .insert({
      numero,
      titulo:       body.titulo.trim(),
      descripcion:  body.descripcion ?? null,
      prioridad:    body.prioridad ?? 'media',
      categoria:    body.categoria ?? 'soporte',
      project_id:   body.project_id ?? null,
      lead_id:      body.lead_id ?? null,
      assignee_id:  body.assignee_id ?? null,
      created_by:   user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-create linked task in the project if one was specified
  if (body.project_id && data) {
    createLinkedTask({
      id: data.id, numero, titulo: body.titulo.trim(),
      prioridad: body.prioridad ?? 'media', project_id: body.project_id,
    }, admin).catch(() => {})
  }

  return NextResponse.json({ data }, { status: 201 })
}
