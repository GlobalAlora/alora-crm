import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PmPriority, ProjectEstado, ProjectTaskEstado } from '@/types'

// ─── Canonical format (what the UI sends) ────────────────
interface ImportSubtask {
  titulo?: string
  nombre?: string
  descripcion?: string
  prioridad?: PmPriority
  fecha_limite?: string
  fecha_fin?: string
  horas_estimadas?: number
  estado?: ProjectTaskEstado
}

interface ImportTask extends ImportSubtask {
  subtasks?: ImportSubtask[]
  subtareas?: ImportSubtask[]
}

interface ImportSection {
  nombre: string
  color?: string
  tasks?: ImportTask[]
}

interface ImportProject {
  nombre: string
  descripcion?: string
  estado?: ProjectEstado
  prioridad?: PmPriority
  fecha_inicio?: string
  fecha_fin?: string
  presupuesto_usd?: number
  color?: string
  sections?: ImportSection[]
}

// ─── AI-generated format: { proyecto: { tareas: [...] } } ──
interface AISubtask {
  nombre: string
  descripcion?: string
  prioridad?: PmPriority
  fecha_fin?: string | null
  estado?: string
  subtareas?: AISubtask[]
}

interface AIPhase {
  nombre: string
  descripcion?: string
  prioridad?: PmPriority
  fecha_fin?: string | null
  estado?: string
  subtareas?: AISubtask[]
}

interface AIProject {
  nombre: string
  descripcion?: string
  estado?: string
  prioridad?: PmPriority
  fecha_inicio?: string
  fecha_fin?: string | null
  tareas?: AIPhase[]
}

const SECTION_COLORS = ['#94A3B8', '#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6']

// ─── Normalize any supported input format ────────────────
function normalize(body: Record<string, unknown>): ImportProject {
  // Handle { proyecto: { ... } } wrapper
  const root: Record<string, unknown> = body.proyecto
    ? (body.proyecto as Record<string, unknown>)
    : body

  // AI format: tareas[] = phases/sections, each with subtareas[] = tasks
  if (Array.isArray(root.tareas)) {
    const ai = root as unknown as AIProject
    return {
      nombre:          ai.nombre,
      descripcion:     ai.descripcion,
      estado:          (ai.estado as ProjectEstado) || 'pendiente',
      prioridad:       ai.prioridad || 'media',
      fecha_inicio:    ai.fecha_inicio,
      fecha_fin:       ai.fecha_fin ?? undefined,
      sections: (ai.tareas ?? []).map((fase, idx) => ({
        nombre: fase.nombre,
        color:  SECTION_COLORS[idx % SECTION_COLORS.length],
        tasks:  (fase.subtareas ?? []).map(t => ({
          titulo:       t.nombre,
          descripcion:  t.descripcion,
          prioridad:    t.prioridad || 'media',
          fecha_limite: t.fecha_fin ?? undefined,
          estado:       (t.estado as ProjectTaskEstado) || 'pendiente',
          subtasks: (t.subtareas ?? []).map(st => ({
            titulo:       st.nombre,
            descripcion:  st.descripcion,
            prioridad:    st.prioridad || 'media',
            fecha_limite: st.fecha_fin ?? undefined,
            estado:       (st.estado as ProjectTaskEstado) || 'pendiente',
          })),
        })),
      })),
    }
  }

  // Canonical format: sections[] with tasks[]
  return {
    nombre:          root.nombre as string,
    descripcion:     root.descripcion as string | undefined,
    estado:          (root.estado as ProjectEstado) || 'pendiente',
    prioridad:       (root.prioridad as PmPriority) || 'media',
    fecha_inicio:    root.fecha_inicio as string | undefined,
    fecha_fin:       root.fecha_fin as string | undefined,
    presupuesto_usd: root.presupuesto_usd as number | undefined,
    color:           root.color as string | undefined,
    sections:        root.sections as ImportSection[] | undefined,
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!['admin', 'sales'].includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const raw = await req.json() as Record<string, unknown>
  const body = normalize(raw)

  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: 'El nombre del proyecto es requerido' }, { status: 400 })
  }

  // 1. Create project
  const { data: project, error: projErr } = await admin
    .from('projects')
    .insert({
      nombre:          body.nombre.trim(),
      descripcion:     body.descripcion    || null,
      estado:          body.estado         || 'pendiente',
      prioridad:       body.prioridad      || 'media',
      fecha_inicio:    body.fecha_inicio   || null,
      fecha_fin:       body.fecha_fin      || null,
      presupuesto_usd: body.presupuesto_usd ? Number(body.presupuesto_usd) : null,
      color:           body.color          || '#5B7FFF',
      created_by:      user.id,
    })
    .select('id')
    .single()

  if (projErr || !project) {
    return NextResponse.json({ error: projErr?.message ?? 'Error al crear proyecto' }, { status: 500 })
  }

  await admin.from('project_members').insert({ project_id: project.id, user_id: user.id, role: 'pm' })

  const sections = body.sections ?? []

  if (sections.length === 0) {
    await admin.from('task_sections').insert([
      { project_id: project.id, nombre: 'Por hacer',   color: '#94A3B8', position: 0, is_done: false },
      { project_id: project.id, nombre: 'En progreso', color: '#3B82F6', position: 1, is_done: false },
      { project_id: project.id, nombre: 'En revisión', color: '#F59E0B', position: 2, is_done: false },
      { project_id: project.id, nombre: 'Finalizado',  color: '#22C55E', position: 3, is_done: true  },
    ])
    return NextResponse.json({ data: { id: project.id } }, { status: 201 })
  }

  // 2. Create sections → tasks → subtasks
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx]
    const { data: section, error: secErr } = await admin
      .from('task_sections')
      .insert({
        project_id: project.id,
        nombre:     sec.nombre.trim(),
        color:      sec.color ?? '#94A3B8',
        position:   sIdx,
        is_done:    false,
      })
      .select('id')
      .single()

    if (secErr || !section) continue

    const tasks = sec.tasks ?? []
    for (let tIdx = 0; tIdx < tasks.length; tIdx++) {
      const task = tasks[tIdx]
      const titulo = (task.titulo || task.nombre || '').trim()
      if (!titulo) continue

      const { data: createdTask, error: taskErr } = await admin
        .from('project_tasks')
        .insert({
          project_id:      project.id,
          section_id:      section.id,
          parent_task_id:  null,
          titulo,
          descripcion:     task.descripcion   || null,
          estado:          task.estado        || 'pendiente',
          prioridad:       task.prioridad     || 'media',
          fecha_limite:    task.fecha_limite || task.fecha_fin || null,
          horas_estimadas: task.horas_estimadas ? Number(task.horas_estimadas) : null,
          position:        tIdx,
          created_by:      user.id,
        })
        .select('id')
        .single()

      if (taskErr || !createdTask) continue

      const subtasks = task.subtasks ?? task.subtareas ?? []
      for (let stIdx = 0; stIdx < subtasks.length; stIdx++) {
        const sub = subtasks[stIdx]
        const subTitulo = (sub.titulo || sub.nombre || '').trim()
        if (!subTitulo) continue

        await admin
          .from('project_tasks')
          .insert({
            project_id:      project.id,
            section_id:      section.id,
            parent_task_id:  createdTask.id,
            titulo:          subTitulo,
            descripcion:     sub.descripcion   || null,
            estado:          sub.estado        || 'pendiente',
            prioridad:       sub.prioridad     || 'media',
            fecha_limite:    sub.fecha_limite || sub.fecha_fin || null,
            horas_estimadas: sub.horas_estimadas ? Number(sub.horas_estimadas) : null,
            position:        stIdx,
            created_by:      user.id,
          })
      }
    }
  }

  return NextResponse.json({ data: { id: project.id } }, { status: 201 })
}
