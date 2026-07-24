import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const { data: project, error: projErr } = await admin
    .from('projects')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (projErr || !project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  // Fetch lead separately (avoid FK join schema-cache issues)
  let lead = null
  if (project.lead_id) {
    const { data } = await admin
      .from('leads')
      .select('id, nombre, apellido, empresa')
      .eq('id', project.lead_id)
      .is('deleted_at', null)
      .maybeSingle()
    lead = data
  }

  // Fetch sections
  const { data: sections } = await admin
    .from('task_sections')
    .select('*')
    .eq('project_id', id)
    .order('position', { ascending: true })

  // Fetch all tasks for this project
  const { data: tasks } = await admin
    .from('project_tasks')
    .select('*')
    .eq('project_id', id)
    .is('deleted_at', null)
    .order('position', { ascending: true })

  const sectionsWithTasks = (sections ?? []).map(s => ({
    ...s,
    tasks: (tasks ?? []).filter(t => t.section_id === s.id),
  }))

  return NextResponse.json({
    data: { ...project, lead, sections: sectionsWithTasks },
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as Record<string, unknown>
  const ALLOWED = ['nombre', 'descripcion', 'estado', 'prioridad', 'fecha_inicio', 'fecha_fin', 'presupuesto_usd', 'color']
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) updates[key] = body[key] ?? null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('projects')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
