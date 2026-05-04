import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string; taskId: string }> }

export async function PATCH(_req: NextRequest, { params }: Params) {
  const { id, taskId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Verify the task belongs to this lead
  const { data: task } = await supabase
    .from('tasks')
    .select('id, completada, titulo, lead_id')
    .eq('id', taskId)
    .eq('lead_id', id)
    .single()

  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 })
  if (!task.completada) return NextResponse.json({ error: 'La tarea ya está pendiente' }, { status: 400 })

  const { data, error } = await supabase
    .from('tasks')
    .update({ completada: false, completada_at: null })
    .eq('id', taskId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
