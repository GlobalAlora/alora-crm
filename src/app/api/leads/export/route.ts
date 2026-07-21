import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PipelineStage, LeadFuente } from '@/types'

const CSV_COLUMNS = [
  'nombre',
  'apellido',
  'email',
  'email_secundario',
  'telefono',
  'empresa',
  'pais',
  'sitio_web',
  'estado_pipeline',
  'fuente',
  'servicios_interesados',
  'responsable',
  'valor_propuesta_usd',
  'valor_propuesta_ars',
  'created_at',
  'last_activity_at',
] as const

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = Array.isArray(value) ? value.join('; ') : String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCsvRow(values: unknown[]): string {
  return values.map(csvEscape).join(',') + '\r\n'
}

// ── GET /api/leads/export ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)

  const estadosPipeline = searchParams.getAll('estado_pipeline') as PipelineStage[]
  const responsableId   = searchParams.get('responsable_id')
  const fuente          = searchParams.get('fuente')
  const pais            = searchParams.get('pais')
  const servicios       = searchParams.getAll('servicio')
  const fechaDesde      = searchParams.get('fecha_desde')
  const fechaHasta      = searchParams.get('fecha_hasta')
  const buscar          = searchParams.get('buscar')?.trim()
  const soloConEmail    = searchParams.get('solo_con_email') === 'true'

  let query = supabase
    .from('leads')
    .select('*, responsable:users!responsable_id(full_name)')
    .is('deleted_at', null)

  if (estadosPipeline.length > 0) {
    query = query.in('estado_pipeline', estadosPipeline)
  } else {
    // Exclude dead/internal stages unless explicitly requested
    query = query.not('estado_pipeline', 'in', '(no_cualificado,consulta_cliente,testing)')
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
  if (servicios.length > 0) {
    query = query.contains('servicios_interesados', servicios)
  }
  if (fechaDesde) {
    query = query.gte('created_at', fechaDesde)
  }
  if (fechaHasta) {
    query = query.lte('created_at', fechaHasta)
  }
  if (buscar) {
    query = query.or(
      `nombre.ilike.%${buscar}%,apellido.ilike.%${buscar}%,email.ilike.%${buscar}%,empresa.ilike.%${buscar}%,telefono.ilike.%${buscar}%`
    )
  }
  if (soloConEmail) {
    query = query.not('email', 'is', null)
  }

  query = query.order('created_at', { ascending: false })

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let csv = '﻿' + toCsvRow(CSV_COLUMNS as unknown as string[])
  for (const lead of data ?? []) {
    csv += toCsvRow([
      lead.nombre,
      lead.apellido,
      lead.email,
      lead.email_secundario,
      lead.telefono,
      lead.empresa,
      lead.pais,
      lead.sitio_web,
      lead.estado_pipeline,
      lead.fuente,
      lead.servicios_interesados,
      lead.responsable?.full_name,
      lead.valor_propuesta_usd,
      lead.valor_propuesta_ars,
      lead.created_at,
      lead.last_activity_at,
    ])
  }

  const filename = `leads_${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
