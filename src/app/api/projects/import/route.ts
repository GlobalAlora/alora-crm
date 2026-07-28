import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PmPriority, ProjectEstado, ProjectTaskEstado } from '@/types'

interface ImportSubtask {
  titulo: string
  descripcion?: string
  prioridad?: PmPriority
  fecha_limite?: string
  horas_estimadas?: number
  estado?: ProjectTaskEstado
}

interface ImportTask extends ImportSubtask {
  subtasks?: ImportSubtask[]
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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!['admin', 'sales'].includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json() as ImportProject

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

  // Auto-add creator as PM
  await admin.from('project_members').insert({ project_id: project.id, user_id: user.id, role: 'pm' })

  const sections = body.sections ?? []

  // If no sections provided, create defaults
  if (sections.length === 0) {
    await admin.from('task_sections').insert([
      { project_id: project.id, nombre: 'Por hacer',   color: '#94A3B8', position: 0, is_done: false },
      { project_id: project.id, nombre: 'En progreso', color: '#3B82F6', position: 1, is_done: false },
      { project_id: project.id, nombre: 'En revisión', color: '#F59E0B', position: 2, is_done: false },
      { project_id: project.id, nombre: 'Finalizado',  color: '#22C55E', position: 3, is_done: true  },
    ])
    return NextResponse.json({ data: { id: project.id } }, { status: 201 })
  }

  // 2. Create sections and their tasks
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
      const { data: createdTask, error: taskErr } = await admin
        .from('project_tasks')
        .insert({
          project_id:      project.id,
          section_id:      section.id,
          parent_task_id:  null,
          titulo:          task.titulo.trim(),
          descripcion:     task.descripcion   || null,
          estado:          task.estado        || 'pendiente',
          prioridad:       task.prioridad     || 'media',
          fecha_limite:    task.fecha_limite  || null,
          horas_estimadas: task.horas_estimadas ? Number(task.horas_estimadas) : null,
          position:        tIdx,
          created_by:      user.id,
        })
        .select('id')
        .single()

      if (taskErr || !createdTask) continue

      // 3. Create subtasks
      const subtasks = task.subtasks ?? []
      for (let stIdx = 0; stIdx < subtasks.length; stIdx++) {
        const sub = subtasks[stIdx]
        await admin
          .from('project_tasks')
          .insert({
            project_id:      project.id,
            section_id:      section.id,
            parent_task_id:  createdTask.id,
            titulo:          sub.titulo.trim(),
            descripcion:     sub.descripcion   || null,
            estado:          sub.estado        || 'pendiente',
            prioridad:       sub.prioridad     || 'media',
            fecha_limite:    sub.fecha_limite  || null,
            horas_estimadas: sub.horas_estimadas ? Number(sub.horas_estimadas) : null,
            position:        stIdx,
            created_by:      user.id,
          })
      }
    }
  }

  return NextResponse.json({ data: { id: project.id } }, { status: 201 })
}
