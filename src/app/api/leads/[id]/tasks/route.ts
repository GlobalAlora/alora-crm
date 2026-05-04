import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { toArgentinaISOString } from '@/lib/timezone'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const sp = req.nextUrl.searchParams
  const completada = sp.get('completada')

  let query = supabase
    .from('tasks')
    .select('*, asignado:users!asignado_a(id, full_name, avatar_url)')
    .eq('lead_id', id)

  if (completada !== null) {
    query = query.eq('completada', completada === 'true')
  }

  // Pending first by due date, then completed by completada_at desc
  const { data: pending } = await supabase
    .from('tasks')
    .select('*, asignado:users!asignado_a(id, full_name, avatar_url)')
    .eq('lead_id', id)
    .eq('completada', false)
    .order('vencimiento', { ascending: true, nullsFirst: false })

  const { data: done } = await supabase
    .from('tasks')
    .select('*, asignado:users!asignado_a(id, full_name, avatar_url)')
    .eq('lead_id', id)
    .eq('completada', true)
    .order('completada_at', { ascending: false })
    .limit(5)

  return NextResponse.json({ data: [...(pending ?? []), ...(done ?? [])] })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { titulo, descripcion, vencimiento, asignado_a } = await req.json()

  if (!titulo?.trim()) {
    return NextResponse.json({ error: 'El título es requerido' }, { status: 400 })
  }

  // Permitir tareas para cualquier hora del día actual
  // if (vencimiento && new Date(vencimiento) < new Date()) {
  //   return NextResponse.json({ error: 'El vencimiento debe ser una fecha futura' }, { status: 400 })
  // }

  // Default assignee: lead's responsable
  let assignee = asignado_a
  if (!assignee) {
    const { data: lead } = await supabase
      .from('leads')
      .select('responsable_id')
      .eq('id', id)
      .single()
    assignee = lead?.responsable_id ?? user.id
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      lead_id: id,
      creado_por: user.id,
      asignado_a: assignee,
      titulo: titulo.trim(),
      descripcion: descripcion ?? null,
      vencimiento: vencimiento ? toArgentinaISOString(new Date(vencimiento)) : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data }, { status: 201 })
}
