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

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  // Run all independent queries in parallel
  const [
    { data: allLeads },
    { count: sinRespuesta },
    { count: tareasVencidas },
    { count: leadsInactivos },
    { count: leadsEstancados },
    { count: leadsCalientes },
    { data: responsablesRaw },
    { data: actividadRaw },
    { data: ultimosLeadsRaw },
    { data: topOportunidadesRaw },
  ] = await Promise.all([
    applyFilters(
      supabase.from('leads').select('estado_pipeline, fuente, fecha_ingreso, valor_propuesta_usd, valor_propuesta_ars, valor_propuesta_moneda, pais, responsable_id, created_at, stage_updated_at, last_activity_at')
    ),
    applyFilters(
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('estado_pipeline', 'lead_contactado')
        .lt('stage_updated_at', twentyFourHoursAgo)
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
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .not('estado_pipeline', 'in', '(cliente_ganado,cliente_perdido,no_cualificado)')
      .lt('stage_updated_at', threeDaysAgo),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .gt('last_activity_at', oneHourAgo),
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
    applyFilters(
      supabase
        .from('leads')
        .select('id, nombre, empresa, estado_pipeline, responsable_id, propuestas(valor_usd, valor_ars, moneda)')
        .is('deleted_at', null)
        .not('estado_pipeline', 'in', '(cliente_ganado,cliente_perdido,no_cualificado)')
        .limit(50)
    ),
  ])

  const leads = allLeads ?? []

  // Aggregate por etapa (count + pipeline value USD/ARS)
  const porEtapaCount: Partial<Record<PipelineStage, number>> = {}
  const porEtapaValueUSD: Partial<Record<PipelineStage, number>> = {}
  const porEtapaValueARS: Partial<Record<PipelineStage, number>> = {}

  // Aggregate por país
  const porPais: Record<string, number> = {}

  // Aggregate por responsable (revenue)
  const revenuePorResponsable: Record<string, { usd: number; ars: number }> = {}

  for (const lead of leads) {
    const stage = lead.estado_pipeline as PipelineStage
    porEtapaCount[stage] = (porEtapaCount[stage] ?? 0) + 1
    porEtapaValueUSD[stage] = (porEtapaValueUSD[stage] ?? 0) + (lead.valor_propuesta_usd ?? 0)
    porEtapaValueARS[stage] = (porEtapaValueARS[stage] ?? 0) + (lead.valor_propuesta_ars ?? 0)

    // Por país
    const pais = lead.pais ?? 'Sin país'
    porPais[pais] = (porPais[pais] ?? 0) + 1

    // Revenue por responsable
    if (lead.responsable_id) {
      if (!revenuePorResponsable[lead.responsable_id]) {
        revenuePorResponsable[lead.responsable_id] = { usd: 0, ars: 0 }
      }
      revenuePorResponsable[lead.responsable_id].usd += lead.valor_propuesta_usd ?? 0
      revenuePorResponsable[lead.responsable_id].ars += lead.valor_propuesta_ars ?? 0
    }
  }

  // Calcular conversión entre etapas y cuello de botella
  const stageOrder: PipelineStage[] = [
    'lead_entrante', 'lead_contactado', 'sin_respuesta', 'reunion_reservada',
    'reunion_realizada', 'propuesta_en_armado', 'propuesta_enviada', 'follow_up', 'cliente_ganado'
  ]
  const conversionRates: Record<string, number> = {}
  let maxDropRate = 0
  let bottleneckStage: PipelineStage | null = null

  for (let i = 0; i < stageOrder.length - 1; i++) {
    const fromStage = stageOrder[i]
    const toStage = stageOrder[i + 1]
    const fromCount = porEtapaCount[fromStage] ?? 0
    const toCount = porEtapaCount[toStage] ?? 0

    if (fromCount > 0) {
      const rate = (toCount / fromCount) * 100
      conversionRates[`${fromStage}->${toStage}`] = rate

      // Identificar cuello de botella (mayor caída)
      const dropRate = 100 - rate
      if (dropRate > maxDropRate && fromCount > 0) {
        maxDropRate = dropRate
        bottleneckStage = fromStage
      }
    }
  }

  // Aggregate por fuente
  const porFuente: Record<string, number> = {}
  for (const lead of leads) {
    const f = lead.fuente ?? 'desconocido'
    porFuente[f] = (porFuente[f] ?? 0) + 1
  }

  // Revenue + forecast (USD y ARS)
  let ganadoUsd = 0
  let ganadoArs = 0
  let weightedTotalUsd = 0
  let weightedTotalArs = 0
  const ganadosConValor: number[] = []
  const forecastAccum = { d7: 0, d30: 0, d90: 0 }

  for (const lead of leads) {
    const valUsd = lead.valor_propuesta_usd ?? 0
    const valArs = lead.valor_propuesta_ars ?? 0
    const prob = REVENUE_PROBABILITY[lead.estado_pipeline as PipelineStage] ?? 0
    const weightedUsd = valUsd * prob
    const weightedArs = valArs * prob
    weightedTotalUsd += weightedUsd
    weightedTotalArs += weightedArs

    if (lead.estado_pipeline === 'cliente_ganado') {
      if (valUsd > 0) {
        ganadoUsd += valUsd
        ganadosConValor.push(valUsd)
      }
      if (valArs > 0) {
        ganadoArs += valArs
      }
    }

    if (prob >= FORECAST_MIN_PROB.d7) forecastAccum.d7 += weightedUsd
    if (prob >= FORECAST_MIN_PROB.d30) forecastAccum.d30 += weightedUsd
    if (prob >= FORECAST_MIN_PROB.d90) forecastAccum.d90 += weightedUsd
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
      const revenue = revenuePorResponsable[u.id] ?? { usd: 0, ars: 0 }
      return {
        id: u.id,
        full_name: u.full_name,
        avatar_url: u.avatar_url ?? null,
        activos: activos ?? 0,
        ganados: ganados ?? 0,
        actividades: actividades ?? 0,
        tasa_conversion: totalUser > 0 ? Math.round(((ganados ?? 0) / totalUser) * 100) : 0,
        revenue_usd: revenue.usd,
        revenue_ars: revenue.ars,
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

  // Procesar top oportunidades: calcular valor total de propuestas por lead
  type RawLeadWithPropuestas = {
    id: string
    nombre: string
    empresa: string | null
    estado_pipeline: PipelineStage
    responsable_id: string | null
    propuestas: { valor_usd: number | null; valor_ars: number | null; moneda: 'USD' | 'ARS' }[] | null
  }
  const topOportunidades = ((topOportunidadesRaw as unknown as RawLeadWithPropuestas[]) ?? [])
    .map((lead) => {
      const propuestas = lead.propuestas ?? []
      const totalUSD = propuestas.reduce((sum, p) => sum + (p.valor_usd ?? 0), 0)
      const totalARS = propuestas.reduce((sum, p) => sum + (p.valor_ars ?? 0), 0)
      const hasUSD = propuestas.some((p) => p.moneda === 'USD' && (p.valor_usd ?? 0) > 0)

      return {
        id: lead.id,
        nombre: lead.nombre,
        empresa: lead.empresa,
        estado_pipeline: lead.estado_pipeline,
        responsable_id: lead.responsable_id,
        valor_propuesta_usd: hasUSD ? totalUSD : null,
        valor_propuesta_ars: hasUSD ? null : totalARS,
        valor_propuesta_moneda: hasUSD ? 'USD' : 'ARS',
      }
    })
    .sort((a, b) => {
      const valA = (a.valor_propuesta_usd ?? 0) + (a.valor_propuesta_ars ?? 0) / 1000 // rough USD equiv for ARS
      const valB = (b.valor_propuesta_usd ?? 0) + (b.valor_propuesta_ars ?? 0) / 1000
      return valB - valA
    })
    .slice(0, 5)

  return NextResponse.json({
    data: {
      leads: {
        total: leads.length,
        por_etapa: porEtapaCount,
        por_etapa_value_usd: porEtapaValueUSD,
        por_etapa_value_ars: porEtapaValueARS,
        por_fuente: porFuente,
        por_pais: porPais,
        nuevos_periodo: nuevosPeriodo,
      },
      revenue: {
        ganado_usd: Math.round(ganadoUsd),
        ganado_ars: Math.round(ganadoArs),
        proyectado_usd: Math.round(weightedTotalUsd),
        proyectado_ars: Math.round(weightedTotalArs),
        ticket_promedio_usd: Math.round(ticketPromedio),
        forecast: {
          d7: Math.round(forecastAccum.d7),
          d30: Math.round(forecastAccum.d30),
          d90: Math.round(forecastAccum.d90),
        },
        pipeline_value_usd: porEtapaValueUSD,
        pipeline_value_ars: porEtapaValueARS,
      },
      conversion: {
        tasa: tasaConversion,
        por_etapa: porEtapaCount,
        rates: conversionRates,
        bottleneck: bottleneckStage,
      },
      alertas: {
        sin_respuesta_24h: sinRespuesta ?? 0,
        tareas_vencidas: tareasVencidas ?? 0,
        leads_inactivos: leadsInactivos ?? 0,
        leads_estancados: leadsEstancados ?? 0,
        leads_calientes: leadsCalientes ?? 0,
      },
      top_responsables: topResponsables,
      actividad_reciente: actividadReciente,
      ultimos_leads: ultimosLeadsRaw ?? [],
      top_oportunidades: topOportunidades,
    },
  })
}
