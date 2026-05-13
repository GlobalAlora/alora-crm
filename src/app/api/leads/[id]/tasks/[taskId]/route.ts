import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normaliseVencimiento } from '@/lib/tz'

type Params = { params: Promise<{ id: string; taskId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, taskId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const allowed = ['titulo', 'descripcion', 'vencimiento', 'asignado_a', 'completada']
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) {
      // Normalise vencimiento: datetime-local (Argentina) → UTC ISO string
      patch[key] = key === 'vencimiento'
        ? normaliseVencimiento(body[key] as string | null)
        : body[key]
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  // Verify the task belongs to this lead
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('id, lead_id')
    .eq('id', taskId)
    .eq('lead_id', id)
    .single()

  if (!existingTask) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', taskId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, taskId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Verify the task belongs to this lead
  const { data: existingTask } = await supabase
    .from('tasks')
    .select('id, lead_id')
    .eq('id', taskId)
    .eq('lead_id', id)
    .single()

  if (!existingTask) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })

  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
