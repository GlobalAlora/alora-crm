import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  // Fetch lead with propuestas and stage history
  const [{ data: lead, error: leadError }, { data: propuestas }, { data: stageHistory }] = await Promise.all([
    supabase
      .from('leads')
      .select('*, responsable:users!responsible_id(id, full_name, avatar_url)')
      .eq('id', id)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('propuestas')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('stage_history')
      .select('*')
      .eq('lead_id', id)
      .order('fecha_ingreso', { ascending: false }),
  ])

  if (leadError || !lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })

  // Compute calidad_lead
  let calidad_lead = 'no_calificado'
  const sqlStages = ['reunion_reservada', 'reunion_realizada', 'propuesta_en_armado', 'propuesta_enviada', 'follow_up', 'cliente_ganado']
  if (sqlStages.includes(lead.estado_pipeline)) {
    calidad_lead = 'SQL'
  } else if (lead.email && lead.servicio_interesado) {
    calidad_lead = 'MQL'
  }

  const dias_sin_respuesta = lead.stage_updated_at
    ? Math.floor((Date.now() - new Date(lead.stage_updated_at).getTime()) / 86_400_000)
    : 0

  return NextResponse.json({ data: { ...lead, propuestas: propuestas || [], stage_history: stageHistory || [], calidad_lead, dias_sin_respuesta } })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()

  // Block protected fields
  const blocked = ['id', 'estado_pipeline', 'kanban_position', 'deleted_at', 'created_at', 'created_by']
  for (const key of blocked) {
    if (key in body) delete body[key]
  }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('leads')
    .update({ ...body, updated_at: new Date().toISOString() })
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

  const { data, error } = await supabase
    .from('leads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, deleted_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
