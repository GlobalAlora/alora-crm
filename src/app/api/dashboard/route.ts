import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { REVENUE_PROBABILITY } from '@/types'
import type { PipelineStage } from '@/types'

// Probability by forecast horizon
const FORECAST_MIN_PROB: Record<'d7' | 'd30' | 'd90', number> = {
  d7: 0.5,   // follow_up, cliente_ganado
  d30: 0.3,  // + propuesta_enviada
  d90: 0.05, // + propuesta_en_armado, reunion_realizada, reunion_reservada
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()

  const sp = req.nextUrl.searchParams
  const responsableId = sp.get('responsable_id')
  const fechaDesde = sp.get('fecha_desde') ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const fechaHasta = sp.get('fecha_hasta') ?? new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(query: any) {
    let q = query.is('deleted_at', null)
    if (responsableId) q = q.eq('responsable_id', responsableId)
    return q
  }

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Run all independent queries in parallel
  const [
    { data: allLeads },
    { count: sinRespuesta },
    { count: tareasVencidas },
    { count: leadsInactivos },
    { data: responsablesRaw },
    { data: actividadRaw },
    { data: ultimosLeadsRaw },
  ] = await Promise.all([
    applyFilters(
      supabase.from('leads').select('estado_pipeline, fuente, fecha_ingreso, valor_propuesta_usd, created_at')
    ),
    applyFilters(
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('estado_pipeline', 'lead_contactado')
        .lt('stage_updated_at', fortyEightHoursAgo)
    ),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('completada', false)
      .lt('vencimiento', new Date().toISOString()),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .not('estado_pipeline', 'in', '(cliente_ganado,cliente_perdido,no_cualificado)')
      .lt('stage_updated_at', sevenDaysAgo),
    supabase.from('users').select('id, full_name, avatar_url').in('role', ['admin', 'sales']),
    supabase
      .from('activities')
      .select('id, tipo, descripcion, created_at, lead_id, leads(nombre), users(full_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('leads')
      .select('id, nombre, estado_pipeline, fuente, created_at, responsable_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const leads = allLeads ?? []

  // Aggregate por etapa (count + pipeline value)
  const porEtapaCount: Partial<Record<PipelineStage, number>> = {}
  const porEtapaValue: Partial<Record<PipelineStage, number>> = {}

  for (const lead of leads) {
    const stage = lead.estado_pipeline as PipelineStage
    porEtapaCount[stage] = (porEtapaCount[stage] ?? 0) + 1
    porEtapaValue[stage] = (porEtapaValue[stage] ?? 0) + (lead.valor_propuesta_usd ?? 0)
  }

  // Aggregate por fuente
  const porFuente: Record<string, number> = {}
  for (const lead of leads) {
    const f = lead.fuente ?? 'desconocido'
    porFuente[f] = (porFuente[f] ?? 0) + 1
  }

  // Revenue + forecast
  let ganadoUsd = 0
  let weightedTotal = 0
  const ganadosConValor: number[] = []
  const forecastAccum = { d7: 0, d30: 0, d90: 0 }

  for (const lead of leads) {
    const val = lead.valor_propuesta_usd ?? 0
    const prob = REVENUE_PROBABILITY[lead.estado_pipeline as PipelineStage] ?? 0
    const weighted = val * prob
    weightedTotal += weighted

    if (lead.estado_pipeline === 'cliente_ganado' && val > 0) {
      ganadoUsd += val
      ganadosConValor.push(val)
    }

    if (prob >= FORECAST_MIN_PROB.d7) forecastAccum.d7 += weighted
    if (prob >= FORECAST_MIN_PROB.d30) forecastAccum.d30 += weighted
    if (prob >= FORECAST_MIN_PROB.d90) forecastAccum.d90 += weighted
  }

  const ticketPromedio = ganadosConValor.length > 0
    ? ganadosConValor.reduce((a, b) => a + b, 0) / ganadosConValor.length
    : 0

  const nuevosPeriodo = leads.filter(
    (l: { fecha_ingreso?: string; created_at: string }) => {
      const date = l.fecha_ingreso ?? l.created_at
      return date >= fechaDesde && date <= fechaHasta
    }
  ).length

  const totalActivos = leads.filter(
    (l: { estado_pipeline: string }) =>
      !['cliente_ganado', 'cliente_perdido', 'no_cualificado'].includes(l.estado_pipeline)
  ).length
  const totalGanados = porEtapaCount['cliente_ganado'] ?? 0
  const tasaConversion = totalActivos + totalGanados > 0
    ? Math.round((totalGanados / (totalActivos + totalGanados)) * 100)
    : 0

  // Top responsables — parallel per-user counts
  const topResponsables = await Promise.all(
    (responsablesRaw ?? []).map(async (u) => {
      const [{ count: activos }, { count: ganados }, { count: actividades }] = await Promise.all([
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('responsable_id', u.id)
          .is('deleted_at', null)
          .not('estado_pipeline', 'in', '(cliente_ganado,cliente_perdido,no_cualificado)'),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('responsable_id', u.id)
          .eq('estado_pipeline', 'cliente_ganado')
          .is('deleted_at', null),
        supabase
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', u.id)
          .gte('created_at', fechaDesde),
      ])

      const totalUser = (activos ?? 0) + (ganados ?? 0)
      return {
        id: u.id,
        full_name: u.full_name,
        avatar_url: u.avatar_url ?? null,
        activos: activos ?? 0,
        ganados: ganados ?? 0,
        actividades: actividades ?? 0,
        tasa_conversion: totalUser > 0 ? Math.round(((ganados ?? 0) / totalUser) * 100) : 0,
      }
    })
  )
  topResponsables.sort((a, b) => b.ganados - a.ganados || b.activos - a.activos)

  // Flatten actividad reciente
  type RawActivity = {
    id: string
    tipo: string
    descripcion: string
    created_at: string
    lead_id: string | null
    leads: { nombre: string } | { nombre: string }[] | null
    users: { full_name: string; avatar_url: string | null } | { full_name: string; avatar_url: string | null }[] | null
  }
  const actividadReciente = ((actividadRaw as unknown as RawActivity[]) ?? []).map((a) => {
    const leadsObj = Array.isArray(a.leads) ? a.leads[0] : a.leads
    const usersObj = Array.isArray(a.users) ? a.users[0] : a.users
    return {
      id: a.id,
      tipo: a.tipo,
      descripcion: a.descripcion,
      created_at: a.created_at,
      lead_id: a.lead_id,
      lead_nombre: leadsObj?.nombre ?? null,
      user_full_name: usersObj?.full_name ?? null,
      user_avatar_url: usersObj?.avatar_url ?? null,
    }
  })

  return NextResponse.json({
    data: {
      leads: {
        total: leads.length,
        por_etapa: porEtapaCount,
        por_etapa_value: porEtapaValue,
        por_fuente: porFuente,
        nuevos_periodo: nuevosPeriodo,
      },
      revenue: {
        ganado_usd: Math.round(ganadoUsd),
        proyectado_usd: Math.round(weightedTotal),
        ticket_promedio_usd: Math.round(ticketPromedio),
        forecast: {
          d7: Math.round(forecastAccum.d7),
          d30: Math.round(forecastAccum.d30),
          d90: Math.round(forecastAccum.d90),
        },
        pipeline_value: porEtapaValue,
      },
      conversion: {
        tasa: tasaConversion,
        por_etapa: porEtapaCount,
      },
      alertas: {
        sin_respuesta_48h: sinRespuesta ?? 0,
        tareas_vencidas: tareasVencidas ?? 0,
        leads_inactivos: leadsInactivos ?? 0,
      },
      top_responsables: topResponsables,
      actividad_reciente: actividadReciente,
      ultimos_leads: ultimosLeadsRaw ?? [],
    },
  })
}
