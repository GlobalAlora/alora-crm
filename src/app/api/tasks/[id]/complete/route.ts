import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: task } = await supabase
    .from('tasks')
    .select('id, completada, titulo, lead_id')
    .eq('id', id)
    .single()

  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })
  if (task.completada) return NextResponse.json({ error: 'La tarea ya está completada' }, { status: 400 })

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('tasks')
    .update({ completada: true, completada_at: now })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log activity
  await supabase.from('activities').insert({
    lead_id: task.lead_id,
    user_id: user.id,
    tipo: 'tarea_completada',
    descripcion: `Tarea completada: "${task.titulo}"`,
    metadata: { task_id: id },
  })

  return NextResponse.json({ data })
}
