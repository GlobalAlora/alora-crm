import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseActionItems } from '@/lib/meeting-notes-parser'
import { matchUser, matchProject } from '@/lib/meeting-notes-match'
import { sendTaskAssignmentEmail } from '@/lib/task-emails'

type AdminClient = ReturnType<typeof createAdminClient>

const SIN_CATEGORIZAR = 'Sin categorizar'
const TASK_DUE_MS = 48 * 60 * 60 * 1000

const DEFAULT_SECTIONS = [
  { nombre: 'Por hacer', color: '#94A3B8', position: 0, is_done: false },
  { nombre: 'En progreso', color: '#3B82F6', position: 1, is_done: false },
  { nombre: 'En revisión', color: '#F59E0B', position: 2, is_done: false },
  { nombre: 'Finalizado', color: '#22C55E', position: 3, is_done: true },
]

// ── POST /api/webhooks/meeting-notes ───────────────────────────────────────────
// Called by Bruno's Make.com scenario for every inbound email at
// walo@globalalora.com whose subject matches "Notas: ...". Turns the
// "Próximos pasos" bullet list into real project_tasks, each due in 48h.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (!secret || secret !== process.env.MEETING_NOTES_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const payload = await req.json().catch(() => null) as { subject?: string; body?: string } | null
  if (!payload) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const subject = (payload.subject ?? '').trim()
  if (!/^notas:/i.test(subject)) {
    return NextResponse.json({ ok: true, skipped: 'El asunto no empieza con "Notas:"' })
  }

  const items = parseActionItems(payload.body ?? '')
  if (items.length === 0) {
    return NextResponse.json({ ok: true, created: 0, note: 'No se encontró la sección "Próximos pasos"' })
  }

  const admin = createAdminClient()

  const [{ data: users }, { data: projects }, { data: walo }] = await Promise.all([
    admin.from('users').select('id, full_name'),
    admin.from('projects').select('id, nombre').is('deleted_at', null),
    admin.from('users').select('id').eq('email', 'somosglobalalora@gmail.com').maybeSingle(),
  ])

  const waloId: string | null = walo?.id ?? null

  const fallbackProjectId = await findOrCreateFallbackProject(admin, projects ?? [], waloId)
  const allProjects = [...(projects ?? []), { id: fallbackProjectId, nombre: SIN_CATEGORIZAR }]

  const sectionCache = new Map<string, string>()
  const positionCache = new Map<string, number>()
  const fechaLimite = new Date(Date.now() + TASK_DUE_MS).toISOString()
  const summary: Array<{ titulo: string; proyecto: string; asignado: string }> = []

  for (const item of items) {
    const projectId = matchProject(item.titulo, item.descripcion, allProjects) ?? fallbackProjectId
    const projectName = allProjects.find((p) => p.id === projectId)?.nombre ?? SIN_CATEGORIZAR
    const assigneeId = matchUser(item.nombre, users ?? [])

    let sectionId: string
    try {
      sectionId = await resolveFirstSection(admin, projectId, sectionCache)
    } catch (err) {
      console.error('[meeting-notes] No se pudo resolver sección para', projectId, err)
      continue
    }
    const position = await nextPosition(admin, sectionId, positionCache)

    const { data: createdTask, error } = await admin
      .from('project_tasks')
      .insert({
        project_id: projectId,
        section_id: sectionId,
        titulo: item.titulo,
        descripcion: item.descripcion,
        estado: 'pendiente',
        prioridad: 'media',
        assignee_id: assigneeId,
        fecha_limite: fechaLimite,
        position,
        created_by: waloId,
      })
      .select('id')
      .single()

    if (error || !createdTask) {
      console.error('[meeting-notes] Failed to create task:', error?.message, item)
      continue
    }

    summary.push({
      titulo: item.titulo,
      proyecto: projectName,
      asignado: assigneeId ? (users?.find((u) => u.id === assigneeId)?.full_name ?? 'asignado') : 'sin asignar',
    })

    if (assigneeId) {
      sendTaskAssignmentEmail({
        admin,
        assigneeId,
        creatorId: waloId ?? '',
        task: {
          titulo: item.titulo,
          descripcion: item.descripcion,
          prioridad: 'media',
          fecha_limite: fechaLimite,
          project_id: projectId,
        },
      }).catch((e) => console.error('[meeting-notes] Failed to send assignment email:', e))
    }
  }

  return NextResponse.json({ ok: true, created: summary.length, tasks: summary })
}

async function findOrCreateFallbackProject(
  admin: AdminClient,
  projects: { id: string; nombre: string }[],
  waloId: string | null,
): Promise<string> {
  const existing = projects.find((p) => p.nombre === SIN_CATEGORIZAR)
  if (existing) return existing.id

  const { data: created, error } = await admin
    .from('projects')
    .insert({
      nombre: SIN_CATEGORIZAR,
      estado: 'pendiente',
      prioridad: 'media',
      color: '#94A3B8',
      created_by: waloId,
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(error?.message ?? 'No se pudo crear el proyecto "Sin categorizar"')
  }
  return created.id
}

async function resolveFirstSection(admin: AdminClient, projectId: string, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(projectId)
  if (cached) return cached

  const { data: existing } = await admin
    .from('task_sections')
    .select('id, position')
    .eq('project_id', projectId)
    .order('position', { ascending: true })
    .limit(1)

  let sectionId = existing?.[0]?.id

  if (!sectionId) {
    const { data: createdSections } = await admin
      .from('task_sections')
      .insert(DEFAULT_SECTIONS.map((s) => ({ ...s, project_id: projectId })))
      .select('id, position')

    sectionId = createdSections?.find((s) => s.position === 0)?.id
  }

  if (!sectionId) throw new Error(`No se pudo resolver una sección para el proyecto ${projectId}`)

  cache.set(projectId, sectionId)
  return sectionId
}

async function nextPosition(admin: AdminClient, sectionId: string, cache: Map<string, number>): Promise<number> {
  const cached = cache.get(sectionId)
  if (cached !== undefined) {
    const next = cached + 1
    cache.set(sectionId, next)
    return next
  }

  const { data: maxRow } = await admin
    .from('project_tasks')
    .select('position')
    .eq('section_id', sectionId)
    .is('deleted_at', null)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const next = (maxRow?.position ?? -1) + 1
  cache.set(sectionId, next)
  return next
}
