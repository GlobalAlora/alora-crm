import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PipelineStage, LeadFuente } from '@/types'

// ── GET /api/leads ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)

  // Filters
  const estadosPipeline = searchParams.getAll('estado_pipeline') as PipelineStage[]
  const responsableId   = searchParams.get('responsable_id')
  const fuente          = searchParams.get('fuente')
  const pais            = searchParams.get('pais')
  const idioma          = searchParams.get('idioma')
  const servicios       = searchParams.getAll('servicio')
  const fechaDesde      = searchParams.get('fecha_desde')
  const fechaHasta      = searchParams.get('fecha_hasta')
  const buscar          = searchParams.get('buscar')?.trim()
  const sortBy          = searchParams.get('sort_by') || 'created_at'
  const sortOrder       = searchParams.get('sort_order') || 'desc'
  const page            = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const limit           = Math.min(500, parseInt(searchParams.get('limit') || '50', 10))
  const offset          = (page - 1) * limit

  let query = supabase
    .from('leads')
    .select(`
      *,
      responsable:users!responsable_id(id, full_name, avatar_url),
      propuestas(
        id,
        valor_usd,
        valor_ars,
        moneda,
        estado
      )
    `, { count: 'exact' })
    .is('deleted_at', null)

  // Apply filters
  if (estadosPipeline.length > 0) {
    query = query.in('estado_pipeline', estadosPipeline)
  }
  if (responsableId) {
    query = query.eq('responsable_id', responsableId)
  }
  if (fuente) {
    query = query.eq('fuente', fuente as LeadFuente)
  }
  if (pais) {
    query = query.eq('pais', pais)
  }
  if (idioma) {
    query = query.eq('idioma', idioma)
  }
  if (servicios.length > 0) {
    query = query.contains('servicios_interesados', servicios)
  }
  if (fechaDesde) {
    query = query.gte('fecha_ingreso', fechaDesde)
  }
  if (fechaHasta) {
    query = query.lte('fecha_ingreso', fechaHasta)
  }
  if (buscar) {
    query = query.or(
      `nombre.ilike.%${buscar}%,apellido.ilike.%${buscar}%,email.ilike.%${buscar}%,empresa.ilike.%${buscar}%,telefono.ilike.%${buscar}%`
    )
  }

  // Sorting
  const allowedSort = ['nombre', 'empresa', 'valor_propuesta_usd', 'last_activity_at', 'created_at', 'kanban_position']
  const safeSortBy = allowedSort.includes(sortBy) ? sortBy : 'created_at'
  query = query.order(safeSortBy, { ascending: sortOrder === 'asc', nullsFirst: false })

  // Pagination
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Calculate proposal totals for each lead
  const dataWithTotals = (data ?? []).map((lead: any) => {
    const propuestas = lead.propuestas || []
    const propuestas_total_usd = propuestas.reduce((sum: number, p: any) => sum + (p.moneda === 'USD' ? (p.valor_usd || 0) : 0), 0)
    const propuestas_total_ars = propuestas.reduce((sum: number, p: any) => sum + (p.moneda === 'ARS' ? (p.valor_ars || 0) : 0), 0)
    const propuestas_count = propuestas.length

    // Remove propuestas from response to avoid circular structure
    const { propuestas: _, ...leadWithoutPropuestas } = lead

    return {
      ...leadWithoutPropuestas,
      propuestas_total_usd,
      propuestas_total_ars,
      propuestas_count,
    }
  })

  return NextResponse.json({
    data: dataWithTotals,
    meta: {
      total: count ?? 0,
      page,
      limit,
      pages: Math.ceil((count ?? 0) / limit),
    },
  })
}

// ── POST /api/leads ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as Record<string, unknown>

  if (!body.nombre || typeof body.nombre !== 'string' || !body.nombre.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
  }

  if (body.email && typeof body.email === 'string') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    }
  }

  // Determine next kanban position in target stage
  const targetStage = (body.estado_pipeline as PipelineStage | undefined | null) ?? 'lead_entrante'

  const { data: targetStageRow } = await supabase
    .from('pipeline_stages')
    .select('key')
    .eq('key', targetStage)
    .maybeSingle()
  if (!targetStageRow) {
    return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 })
  }

  const { data: maxPos, error: posError } = await supabase
    .from('leads')
    .select('kanban_position')
    .eq('estado_pipeline', targetStage)
    .is('deleted_at', null)
    .order('kanban_position', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (posError) {
    console.error('[POST /api/leads] kanban position query failed:', posError)
    // Non-fatal: continue with position 1 rather than failing the whole request
  }

  const payload = {
    nombre:                 (body.nombre as string).trim(),
    apellido:               body.apellido || null,
    email:                  body.email || null,
    email_secundario:       body.email_secundario || null,
    telefono:               body.telefono || null,
    empresa:                body.empresa || null,
    pais:                   body.pais || null,
    sitio_web:              body.sitio_web || null,
    servicios_interesados:  Array.isArray(body.servicios_interesados) ? body.servicios_interesados : [],
    servicio_interesado:    Array.isArray(body.servicios_interesados) ? (body.servicios_interesados[0] ?? null) : null,
    fuente:                 body.fuente || null,
    estado_pipeline:        targetStage,
    valor_propuesta_usd:    body.valor_propuesta_usd ? Number(body.valor_propuesta_usd) : null,
    valor_propuesta_ars:    body.valor_propuesta_ars ? Number(body.valor_propuesta_ars) : null,
    valor_propuesta_moneda: body.valor_propuesta_moneda || 'USD',
    notas:                  null, // No guardar notas en el lead, se crearán como actividad
    responsable_id:         body.responsable_id || null,
    kanban_position:        (maxPos?.kanban_position ?? 0) + 1,
    created_by:             user.id,
  }

  const { data, error } = await supabase
    .from('leads')
    .insert(payload)
    .select('*, responsable:users!responsable_id(id, full_name, avatar_url)')
    .single()

  if (error) {
    console.error('Error creating lead:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Si hay notas, crear una actividad de tipo "nota"
  if (body.notas && typeof body.notas === 'string' && body.notas.trim()) {
    const { error: activityError } = await supabase
      .from('activities')
      .insert({
        lead_id: data.id,
        user_id: user.id,
        tipo: 'nota',
        descripcion: body.notas.trim(),
      })

    if (activityError) {
      console.error('Error al crear actividad de nota:', activityError)
      // No devolver error, el lead ya fue creado
    }
  }

  return NextResponse.json({ data }, { status: 201 })
}
