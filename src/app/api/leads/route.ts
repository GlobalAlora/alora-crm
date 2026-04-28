import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PipelineStage, LeadFuente } from '@/types'

const MAX_LIMIT = 100

export async function GET(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams

  const view = sp.get('view') ?? 'list'
  const limit = Math.min(Number(sp.get('limit') ?? 50), MAX_LIMIT)
  const page = Math.max(Number(sp.get('page') ?? 1), 1)
  const offset = (page - 1) * limit

  let query = supabase
    .from('leads')
    .select('*, responsable:users!responsable_id(id, full_name, avatar_url)', { count: 'exact' })
    .is('deleted_at', null)

  // Filters
  const estados = sp.getAll('estado_pipeline') as PipelineStage[]
  if (estados.length > 0) query = query.in('estado_pipeline', estados)

  const responsableId = sp.get('responsable_id')
  if (responsableId) query = query.eq('responsable_id', responsableId)

  const fuente = sp.get('fuente') as LeadFuente | null
  if (fuente) query = query.eq('fuente', fuente)

  const fechaDesde = sp.get('fecha_desde')
  if (fechaDesde) query = query.gte('fecha_ingreso', fechaDesde)

  const fechaHasta = sp.get('fecha_hasta')
  if (fechaHasta) query = query.lte('fecha_ingreso', fechaHasta)

  const buscar = sp.get('buscar')
  if (buscar) {
    query = query.or(`nombre.ilike.%${buscar}%,email.ilike.%${buscar}%,empresa.ilike.%${buscar}%`)
  }

  // Order
  const sortBy = sp.get('sort_by') as 'nombre' | 'empresa' | 'valor_propuesta_usd' | 'last_activity_at' | 'created_at' | null
  const sortOrder = sp.get('sort_order') === 'asc' ? { ascending: true } : { ascending: false }

  if (view === 'kanban') {
    query = query.order('estado_pipeline').order('kanban_position')
  } else if (sortBy) {
    query = query.order(sortBy, sortOrder)
  } else {
    query = query.order('last_activity_at', { ascending: false })
  }

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data,
    meta: {
      total: count ?? 0,
      page,
      limit,
      total_pages: Math.ceil((count ?? 0) / limit),
    },
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()

  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
  }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  // Get max kanban_position for lead_entrante
  const { data: maxPos } = await supabase
    .from('leads')
    .select('kanban_position')
    .eq('estado_pipeline', 'lead_entrante')
    .is('deleted_at', null)
    .order('kanban_position', { ascending: false })
    .limit(1)
    .single()

  const kanban_position = (maxPos?.kanban_position ?? 0) + 1

  const { data, error } = await supabase
    .from('leads')
    .insert({
      nombre: body.nombre.trim(),
      email: body.email ?? null,
      telefono: body.telefono ?? null,
      empresa: body.empresa ?? null,
      pais: body.pais ?? null,
      servicio_interesado: body.servicio_interesado ?? null,
      presupuesto_estimado: body.presupuesto_estimado ?? null,
      fuente: body.fuente ?? null,
      valor_propuesta_usd: body.valor_propuesta_usd ?? null,
      tipo_cambio_usd_ars: body.tipo_cambio_usd_ars ?? null,
      notas: body.notas ?? null,
      responsable_id: body.responsable_id ?? user.id,
      created_by: user.id,
      estado_pipeline: 'lead_entrante',
      kanban_position,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create initial activity
  await supabase.from('activities').insert({
    lead_id: data.id,
    user_id: user.id,
    tipo: 'cambio_estado',
    descripcion: 'Lead creado',
    metadata: { estado_nuevo: 'lead_entrante' },
  })

  return NextResponse.json({ data }, { status: 201 })
}
