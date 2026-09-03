/**
 * GET /api/analytics
 *
 * Analytical KPI dashboard — all metrics computed for the selected period
 * (filtered by fecha_ingreso of the lead).
 *
 * Query params:
 *   fecha_desde  YYYY-MM-DD  (default: 30 days ago)
 *   fecha_hasta  YYYY-MM-DD  (default: today)
 *   pais         string      optional
 *   fuente       string      optional
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIMEZONE } from '@/lib/timezone'
import { FOLLOWUP_TEXT } from '@/lib/whatsapp-followup'

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysDiff(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null
  const d = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000
  return Math.round(d)
}

function avg(values: number[]): number | null {
  const valid = values.filter(v => v >= 0 && isFinite(v))
  if (!valid.length) return null
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function pct(part: number, whole: number): number {
  return whole > 0 ? round1((part / whole) * 100) : 0
}

// ── Stage → funnel mapping ────────────────────────────────────────────────────

// Which funnel stage a "perdido" lead was at (based on real signals — a
// real propuestas row, not the fecha_propuesta stamp, which can be set by
// a card passing through the "Propuesta enviada" column without an actual
// proposal ever being sent — confirmed 2026-08-17, see memory:
// project_alora_crm_lead_quality_definitions)
// Keys match the funnel stages below exactly, so "perdidos por etapa" can
// look up its count directly by funnel stage key without a mismatch.
function perdidoEnEtapa(lead: LeadRow): 'ingreso' | 'reunion_agendada' | 'propuesta' {
  if ((lead.propuestas ?? []).length > 0) return 'propuesta'
  if (lead.fecha_reunion) return 'reunion_agendada'
  return 'ingreso'
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Propuesta = {
  id: string
  valor_usd: number | null
  valor_ars: number | null
  moneda: 'USD' | 'ARS'
  estado: string
  created_at: string
  updated_at: string
}

type LeadRow = {
  id: string
  nombre: string
  apellido: string | null
  pais: string | null
  fuente: string | null
  estado_pipeline: string
  fecha_ingreso: string | null
  created_at: string
  fecha_contacto: string | null
  fecha_reunion: string | null
  reunion_asistencia: string | null
  reunion_asistencia_at: string | null
  fecha_propuesta: string | null
  fecha_cierre: string | null
  stage_updated_at: string
  last_activity_at: string
  servicios_interesados: string[] | null
  propuestas: Propuesta[] | null
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const sp = req.nextUrl.searchParams
    const today = new Date().toISOString().split('T')[0]
    const defaultDesde = new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0]

    const fechaDesde = sp.get('fecha_desde') ?? defaultDesde
    const fechaHasta = sp.get('fecha_hasta') ?? today
    const paisFilter = sp.get('pais') ?? ''
    const fuenteFilter = sp.get('fuente') ?? ''

    const adminSupabase = createAdminClient()

    // .not().in() silently returns 0 rows in this Supabase version — filter stages in JS.
    // fecha_ingreso can be null (e.g. TidyCal leads) — fall back to created_at for those.
    // Only truly-not-a-lead stages are excluded from the base count. 'no_cualificado'
    // and 'basura' ARE real leads — they're broken out as their own metrics below,
    // not hidden. See memory: project_alora_crm_lead_quality_definitions (2026-08-17).
    const EXCLUDED = new Set(['consulta_cliente', 'testing'])

    // ── Main query: leads in period ─────────────────────────────────────────
    // Use OR so leads with null fecha_ingreso fall back to created_at for date check
    let leadsQuery = adminSupabase
      .from('leads')
      .select(`
        id, nombre, apellido, pais, fuente, estado_pipeline,
        fecha_ingreso, fecha_contacto, fecha_reunion, reunion_asistencia, reunion_asistencia_at, fecha_propuesta, fecha_cierre,
        stage_updated_at, last_activity_at, created_at, servicios_interesados,
        propuestas(id, valor_usd, valor_ars, moneda, estado, created_at, updated_at)
      `)
      .is('deleted_at', null)
      .or(`fecha_ingreso.gte.${fechaDesde},and(fecha_ingreso.is.null,created_at.gte.${fechaDesde})`)
      .or(`fecha_ingreso.lte.${fechaHasta}T23:59:59,and(fecha_ingreso.is.null,created_at.lte.${fechaHasta}T23:59:59)`)

    if (paisFilter) leadsQuery = leadsQuery.eq('pais', paisFilter)
    if (fuenteFilter) leadsQuery = leadsQuery.eq('fuente', fuenteFilter)

    // Closed leads in period: filtered by fecha_cierre (not fecha_ingreso)
    // This captures leads that closed THIS period regardless of when they entered
    const cierresQuery = adminSupabase
      .from('leads')
      .select(`
        id, nombre, apellido, pais, fuente, estado_pipeline,
        fecha_ingreso, fecha_contacto, fecha_reunion, reunion_asistencia, reunion_asistencia_at, fecha_propuesta, fecha_cierre,
        stage_updated_at, last_activity_at, created_at,
        propuestas(id, valor_usd, valor_ars, moneda, estado, created_at, updated_at)
      `)
      .is('deleted_at', null)
      .in('estado_pipeline', ['cliente_ganado', 'cliente_perdido'])
      .gte('fecha_cierre', fechaDesde)
      .lte('fecha_cierre', fechaHasta + 'T23:59:59')

    // Reuniones canceladas por ALORA en el período: filtradas por
    // reunion_asistencia_at (cuándo se marcó la cancelación), no por
    // fecha_ingreso del lead — mismo criterio que cierresQuery, para que
    // "Hoy" muestre lo que realmente se canceló hoy, sin importar cuándo
    // entró el lead.
    let canceladasAloraQuery = adminSupabase
      .from('leads')
      .select(`
        id, nombre, apellido, pais, fuente, estado_pipeline,
        fecha_ingreso, fecha_contacto, fecha_reunion, reunion_asistencia, reunion_asistencia_at, fecha_propuesta, fecha_cierre,
        stage_updated_at, last_activity_at, created_at,
        propuestas(id, valor_usd, valor_ars, moneda, estado, created_at, updated_at)
      `)
      .is('deleted_at', null)
      .eq('reunion_asistencia', 'cancelada_alora')
      .gte('reunion_asistencia_at', fechaDesde)
      .lte('reunion_asistencia_at', fechaHasta + 'T23:59:59')

    if (paisFilter) canceladasAloraQuery = canceladasAloraQuery.eq('pais', paisFilter)
    if (fuenteFilter) canceladasAloraQuery = canceladasAloraQuery.eq('fuente', fuenteFilter)

    // Reuniones agendadas/realizadas en el período: filtradas por fecha_reunion,
    // no por fecha_ingreso del lead -- mismo criterio que cierresQuery y
    // canceladasAloraQuery. Sin esto, una reunión agendada este mes para un
    // lead que ingresó el mes pasado quedaba invisible en "este mes" (el
    // lead nunca entraba al set base, filtrado por fecha_ingreso) -- ese era
    // el bug reportado: el panel de Reuniones mostraba solo 2 en el mes
    // cuando hubo muchas más.
    let reunionesQuery = adminSupabase
      .from('leads')
      .select(`
        id, nombre, apellido, pais, fuente, estado_pipeline,
        fecha_ingreso, fecha_contacto, fecha_reunion, reunion_asistencia, reunion_asistencia_at, fecha_propuesta, fecha_cierre,
        stage_updated_at, last_activity_at, created_at,
        propuestas(id, valor_usd, valor_ars, moneda, estado, created_at, updated_at)
      `)
      .is('deleted_at', null)
      .neq('estado_pipeline', 'basura')
      .not('fecha_reunion', 'is', null)
      .gte('fecha_reunion', fechaDesde)
      .lte('fecha_reunion', fechaHasta + 'T23:59:59')

    if (paisFilter) reunionesQuery = reunionesQuery.eq('pais', paisFilter)
    if (fuenteFilter) reunionesQuery = reunionesQuery.eq('fuente', fuenteFilter)

    // Propuestas del período: filtradas por el created_at DE LA PROPUESTA,
    // no por fecha_ingreso del lead que la recibió -- mismo bug que
    // reunionesQuery de arriba. Una propuesta hecha este mes para un lead
    // que ingresó el mes pasado quedaba invisible porque el lead nunca
    // entraba al set base "leads" (filtrado por fecha_ingreso), así que
    // .flatMap(l => l.propuestas) nunca la veía.
    const propuestasQuery = adminSupabase
      .from('propuestas')
      .select(`
        id, valor_usd, valor_ars, moneda, estado, created_at, updated_at, lead_id,
        lead:leads(id, nombre, apellido, pais, fuente, estado_pipeline, deleted_at)
      `)
      .gte('created_at', fechaDesde)
      .lte('created_at', fechaHasta + 'T23:59:59')

    const [leadsResult, cierresResult, canceladasAloraResult, reunionesResult, propuestasResult] = await Promise.all([
      leadsQuery,
      cierresQuery,
      canceladasAloraQuery,
      reunionesQuery,
      propuestasQuery,
    ])

    // Filter excluded stages in JS
    const leads: LeadRow[] = ((leadsResult.data ?? []) as unknown as LeadRow[])
      .filter(l => !EXCLUDED.has(l.estado_pipeline))
    // Leads closed in period (by fecha_cierre) — used for resumen KPIs
    const cierresEnPeriodo: LeadRow[] = (cierresResult.data ?? []) as unknown as LeadRow[]
    const reunionesCanceladasAlora: LeadRow[] = (canceladasAloraResult.data ?? []) as unknown as LeadRow[]
    const reunionesEnPeriodo: LeadRow[] = (reunionesResult.data ?? []) as unknown as LeadRow[]

    // Propuestas del período (por su propio created_at, ver propuestasQuery
    // arriba) -- excluye las de leads borrados/testing/consulta_cliente y
    // aplica los mismos filtros de país/fuente que el resto del dashboard
    // (Supabase no filtra bien columnas de una tabla anidada, se hace en JS
    // como el resto de este archivo).
    type PropuestaConLeadRaw = Propuesta & { lead_id: string; lead: (LeadRow & { deleted_at: string | null }) | null }
    const propuestasEnPeriodoRaw = ((propuestasResult.data ?? []) as unknown as PropuestaConLeadRaw[])
      .filter(p => p.lead && !p.lead.deleted_at && !EXCLUDED.has(p.lead.estado_pipeline))
      .filter(p => !paisFilter || p.lead?.pais === paisFilter)
      .filter(p => !fuenteFilter || p.lead?.fuente === fuenteFilter)

    const allPropuestas = propuestasEnPeriodoRaw
    // Same propuestas, but keeping which lead each one belongs to — needed
    // for the "Propuestas enviadas/ganadas" drill-down (allPropuestas alone
    // loses that context).
    const allPropuestasConLead = propuestasEnPeriodoRaw.map(p => ({
      ...p,
      lead_nombre: [p.lead?.nombre, p.lead?.apellido].filter(Boolean).join(' '),
    }))

    // ── Calidad de leads ─────────────────────────────────────────────────────
    // Basura = ni siquiera es una consulta real. No cualificado = hubo diálogo
    // real pero no es algo que ALORA pueda/deba resolver. Cualificado = todo
    // lo demás — la consulta original era atendible, independientemente de si
    // convirtió (incluye Sin respuesta, Ghosting, Ganado y Perdido).
    // Ver memoria: project_alora_crm_lead_quality_definitions (2026-08-17).
    const basuraLeads = leads.filter(l => l.estado_pipeline === 'basura')
    const noCualificadoLeads = leads.filter(l => l.estado_pipeline === 'no_cualificado')
    const cualificados = leads.filter(l => l.estado_pipeline !== 'basura' && l.estado_pipeline !== 'no_cualificado')

    // ── Section 1: Resumen Ejecutivo ─────────────────────────────────────────

    const totalLeads = leads.length
    const cualificadoCount = cualificados.length

    // Cierres: uses fecha_cierre filter so leads closed this period are counted
    // regardless of when they entered the pipeline
    const ganados  = cierresEnPeriodo.filter(l => l.estado_pipeline === 'cliente_ganado')
    const perdidos = cierresEnPeriodo.filter(l => l.estado_pipeline === 'cliente_perdido')

    // tasa de cierre = cierres ganados en período / leads CUALIFICADOS en período
    // (basura/no_cualificado nunca iban a cerrar — contarlos en el denominador
    // diluye artificialmente la tasa real)
    const tasaCierreGanado = pct(ganados.length, cualificadoCount)

    const propuestasEnviadas = allPropuestas
    const propuestasAceptadas = allPropuestas.filter(p => p.estado === 'aceptada')
    const tasaConversionPropuesta = pct(propuestasAceptadas.length, propuestasEnviadas.length)

    // ── Reuniones: agendada (se cargó fecha/hora/link) vs realizada
    // (confirmado manualmente en la ficha que se presentó). Ambas se miden
    // por separado para poder ver el show-up rate. reunion_asistencia solo
    // es confiable desde 2026-08-17 — antes hubo una carga masiva vía
    // TidyCal con datos históricos ruidosos.
    //
    // Dos variantes con propósitos distintos:
    // - reunionesAgendadas/Realizadas (cualificados): para el FUNNEL y sus
    //   conversiones, donde tienen que ser subconjunto de "leads cualificados"
    //   para que el embudo tenga sentido visualmente.
    // - *Total (todos salvo basura): para el panel "Reuniones" que ve el
    //   usuario — una reunión que de verdad pasó sigue contando aunque el
    //   lead se haya reclasificado a No cualificado después (típicamente
    //   pasa junto con "Cancelada por ALORA": se agenda, se charla, recién
    //   ahí se decide que no califica). Excluir esos leads escondía
    //   reuniones reales — confirmado con Leo y María, ambos con reunión
    //   agendada y luego marcados No cualificado.
    const reunionesAgendadas = cualificados.filter(l => !!l.fecha_reunion)
    const reunionesRealizadas = cualificados.filter(l => l.reunion_asistencia === 'se_presento')
    // *Total usa reunionesEnPeriodo (filtrado por fecha_reunion), no el set
    // base "leads" (filtrado por fecha_ingreso) -- ver comentario en la query.
    const reunionesAgendadasTotal = reunionesEnPeriodo
    const reunionesRealizadasTotal = reunionesEnPeriodo.filter(l => l.reunion_asistencia === 'se_presento')
    const showUpRateTotal = pct(reunionesRealizadasTotal.length, reunionesAgendadasTotal.length)
    // De las agendadas: no-show real del lead, y las que nadie entró a
    // confirmar todavía en la ficha (reunion_asistencia sigue null) — para
    // que se pueda ver y completar lo que falta.
    const reunionesNoSePresento = reunionesAgendadasTotal.filter(l => l.reunion_asistencia === 'no_se_presento')
    const reunionesSinInformacion = reunionesAgendadasTotal.filter(l => !l.reunion_asistencia)

    // Leads cualificados con al menos una propuesta real (tabla propuestas,
    // no fecha_propuesta — esa se autocompleta al mover la tarjeta de
    // columna y puede quedar seteada sin que se haya mandado nada real)
    const cualificadosConPropuesta = cualificados.filter(l => (l.propuestas ?? []).length > 0)

    // Conversiones del embudo, sobre la base de leads cualificados
    const conversionLeadReunion   = pct(reunionesAgendadas.length, cualificadoCount)
    const conversionLeadPropuesta = pct(cualificadosConPropuesta.length, cualificadoCount)
    const conversionReunionPropuesta = pct(cualificadosConPropuesta.length, reunionesRealizadas.length)

    // Ciclo de venta promedio (ingreso → cierre ganado)
    const cicloVentaDays = ganados
      .map(l => daysDiff(l.fecha_ingreso, l.fecha_cierre))
      .filter((d): d is number => d !== null && d >= 0)
    const cicloVentaPromedio = avg(cicloVentaDays)

    // Tiempo ingreso → propuesta aceptada
    // For each lead with accepted proposals, use the earliest accepted proposal's updated_at
    const tiempoIngresoAceptadaDays = leads
      .map(l => {
        const aceptadas = (l.propuestas ?? []).filter(p => p.estado === 'aceptada')
        if (!aceptadas.length) return null
        const earliest = aceptadas.reduce((a, b) =>
          new Date(a.updated_at) < new Date(b.updated_at) ? a : b
        )
        return daysDiff(l.fecha_ingreso, earliest.updated_at)
      })
      .filter((d): d is number => d !== null && d >= 0)
    const tiempoIngresoAceptada = avg(tiempoIngresoAceptadaDays)

    // Tiempo propuesta enviada → aceptada (from propuesta table)
    const tiempoPropuestaAceptacionDays = propuestasAceptadas
      .map(p => daysDiff(p.created_at, p.updated_at))
      .filter((d): d is number => d !== null && d >= 0)
    const tiempoPropuestaAceptacion = avg(tiempoPropuestaAceptacionDays)

    // Valores por moneda
    const propuestasEnviadasARS = propuestasEnviadas.filter(p => p.moneda === 'ARS').reduce((s, p) => s + (p.valor_ars ?? 0), 0)
    const propuestasEnviadasUSD = propuestasEnviadas.filter(p => p.moneda === 'USD').reduce((s, p) => s + (p.valor_usd ?? 0), 0)

    // "Ganadas" = propuestas aceptadas de los leads cerrados-ganados en el período
    // Usamos cierresEnPeriodo (por fecha_cierre) para no perder leads que entraron antes del período
    const propuestasDeGanados = ganados.flatMap(l =>
      (l.propuestas ?? []).filter(p => p.estado === 'aceptada')
        .map(p => ({ ...p, lead_id: l.id, lead_nombre: [l.nombre, l.apellido].filter(Boolean).join(' ') }))
    )
    const propuestasGanadasARS = propuestasDeGanados.filter(p => p.moneda === 'ARS').reduce((s, p) => s + (p.valor_ars ?? 0), 0)
    const propuestasGanadasUSD = propuestasDeGanados.filter(p => p.moneda === 'USD').reduce((s, p) => s + (p.valor_usd ?? 0), 0)

    // "Perdidas" = propuestas rechazadas de los leads cerrados-perdidos en el período (mismo criterio que ganadas)
    const propuestasDePerdidos = perdidos.flatMap(l =>
      (l.propuestas ?? []).filter(p => p.estado === 'rechazada')
        .map(p => ({ ...p, lead_id: l.id, lead_nombre: [l.nombre, l.apellido].filter(Boolean).join(' ') }))
    )
    const propuestasPerdidasARS = propuestasDePerdidos.filter(p => p.moneda === 'ARS').reduce((s, p) => s + (p.valor_ars ?? 0), 0)
    const propuestasPerdidasUSD = propuestasDePerdidos.filter(p => p.moneda === 'USD').reduce((s, p) => s + (p.valor_usd ?? 0), 0)

    // Combinado (ambas monedas) de todas las propuestas del período, no solo las de leads cerrados
    const propuestasRechazadas = allPropuestas.filter(p => p.estado === 'rechazada')
    const tasaPerdidaPropuesta = pct(propuestasRechazadas.length, propuestasEnviadas.length)

    // ── Section 2: Funnel ────────────────────────────────────────────────────
    // Funnel se calcula sobre leads CUALIFICADOS únicamente — basura/no
    // cualificado nunca iban a avanzar, incluirlos solo diluye las tasas.
    const ganadosCohort  = cualificados.filter(l => l.estado_pipeline === 'cliente_ganado')
    const perdidosCohort = cualificados.filter(l => l.estado_pipeline === 'cliente_perdido')

    const funnelStages = [
      { key: 'ingreso',           label: 'Leads cualificados',  count: cualificados.length },
      { key: 'reunion_agendada',  label: 'Reunión agendada',    count: reunionesAgendadas.length },
      { key: 'reunion_realizada', label: 'Reunión realizada',   count: reunionesRealizadas.length },
      { key: 'propuesta',         label: 'Propuesta enviada',   count: cualificadosConPropuesta.length },
      { key: 'ganado',            label: 'Cierre ganado',       count: ganadosCohort.length },
    ]

    // Perdidos por etapa (cohort)
    const perdidosPorEtapa: Record<string, number> = {
      ingreso: 0, reunion_agendada: 0, propuesta: 0,
    }
    for (const l of perdidosCohort) {
      perdidosPorEtapa[perdidoEnEtapa(l)]++
    }

    const funnel = funnelStages.map((stage, idx) => ({
      key: stage.key,
      label: stage.label,
      cantidad: stage.count,
      tasa_vs_anterior: idx === 0 || funnelStages[idx - 1].count === 0
        ? null
        : pct(stage.count, funnelStages[idx - 1].count),
      tasa_acumulada: pct(stage.count, cualificados.length),
      perdidos: perdidosPorEtapa[stage.key] ?? 0,
    }))

    // ── Section 3: Tiempos entre etapas ─────────────────────────────────────
    // Sobre leads cualificados — el timing de basura/no cualificado no es
    // dato de ciclo de venta real.

    const tiempos = {
      ingreso_contacto: avg(
        cualificados.filter(l => l.fecha_contacto)
          .map(l => daysDiff(l.fecha_ingreso, l.fecha_contacto))
          .filter((d): d is number => d !== null && d >= 0)
      ),
      contacto_reunion: avg(
        cualificados.filter(l => l.fecha_contacto && l.fecha_reunion)
          .map(l => daysDiff(l.fecha_contacto, l.fecha_reunion))
          .filter((d): d is number => d !== null && d >= 0)
      ),
      reunion_propuesta: avg(
        cualificados.filter(l => l.fecha_reunion && l.fecha_propuesta)
          .map(l => daysDiff(l.fecha_reunion, l.fecha_propuesta))
          .filter((d): d is number => d !== null && d >= 0)
      ),
      propuesta_cierre_ganado: avg(
        ganados.filter(l => l.fecha_propuesta && l.fecha_cierre)
          .map(l => daysDiff(l.fecha_propuesta, l.fecha_cierre))
          .filter((d): d is number => d !== null && d >= 0)
      ),
      propuesta_cierre_perdido: avg(
        perdidos.filter(l => l.fecha_propuesta)
          .map(l => daysDiff(l.fecha_propuesta, l.stage_updated_at))
          .filter((d): d is number => d !== null && d >= 0)
      ),
    }

    // ── Section 4: Análisis de propuestas ───────────────────────────────────

    const propuestasPorMoneda = (['ARS', 'USD'] as const).map(moneda => {
      const props = allPropuestas.filter(p => p.moneda === moneda)
      const acept = props.filter(p => p.estado === 'aceptada')
      const rechaz = props.filter(p => p.estado === 'rechazada')
      const valorKey = moneda === 'ARS' ? 'valor_ars' : 'valor_usd'

      const ticketGanado = avg(acept.map(p => p[valorKey] ?? 0).filter(v => v > 0))
      const ticketPerdido = avg(rechaz.map(p => p[valorKey] ?? 0).filter(v => v > 0))

      const tiempoAcept = avg(
        acept.map(p => daysDiff(p.created_at, p.updated_at))
          .filter((d): d is number => d !== null && d >= 0)
      )

      return {
        moneda,
        total_enviadas: props.length,
        aceptadas: acept.length,
        rechazadas: rechaz.length,
        tasa_aceptacion: props.length > 0
          ? Math.round((acept.length / props.length) * 100 * 10) / 10
          : 0,
        ticket_promedio_ganado: ticketGanado,
        ticket_promedio_perdido: ticketPerdido,
        tiempo_promedio_aceptacion: tiempoAcept,
      }
    }).filter(p => p.total_enviadas > 0)

    // ── Section 5: Por país ──────────────────────────────────────────────────

    const paisMap = new Map<string, LeadRow[]>()
    for (const l of cualificados) {
      const pais = l.pais ?? 'Sin país'
      if (!paisMap.has(pais)) paisMap.set(pais, [])
      paisMap.get(pais)!.push(l)
    }

    const porPais = Array.from(paisMap.entries()).map(([pais, paisLeads]) => {
      const paisGanados = paisLeads.filter(l => l.estado_pipeline === 'cliente_ganado')
      const paisPerdidos = paisLeads.filter(l => l.estado_pipeline === 'cliente_perdido')
      const paisProps = paisLeads.flatMap(l => l.propuestas ?? [])
      const paisPropsAcept = paisProps.filter(p => p.estado === 'aceptada')

      const ciclo = avg(
        paisGanados.filter(l => l.fecha_cierre)
          .map(l => daysDiff(l.fecha_ingreso, l.fecha_cierre))
          .filter((d): d is number => d !== null && d >= 0)
      )

      const ticketARS = avg(paisPropsAcept.filter(p => p.moneda === 'ARS').map(p => p.valor_ars ?? 0).filter(v => v > 0))
      const ticketUSD = avg(paisPropsAcept.filter(p => p.moneda === 'USD').map(p => p.valor_usd ?? 0).filter(v => v > 0))

      // Etapa donde se pierden más leads de este país
      const perdidaCount: Record<string, number> = {}
      for (const l of paisPerdidos) {
        const e = perdidoEnEtapa(l)
        perdidaCount[e] = (perdidaCount[e] ?? 0) + 1
      }
      const etapaPerdidaMap: Record<string, string> = {
        ingreso: 'Ingreso', reunion_agendada: 'Reunión agendada', propuesta: 'Propuesta',
      }
      const etapaMasComun = Object.entries(perdidaCount).sort((a, b) => b[1] - a[1])[0]

      return {
        pais,
        cantidad: paisLeads.length,
        ganados: paisGanados.length,
        tasa_cierre: paisLeads.length > 0
          ? Math.round((paisGanados.length / paisLeads.length) * 100 * 10) / 10
          : 0,
        ciclo_venta: ciclo,
        ticket_promedio_ars: ticketARS,
        ticket_promedio_usd: ticketUSD,
        valor_total_ars: paisPropsAcept.filter(p => p.moneda === 'ARS').reduce((s, p) => s + (p.valor_ars ?? 0), 0),
        valor_total_usd: paisPropsAcept.filter(p => p.moneda === 'USD').reduce((s, p) => s + (p.valor_usd ?? 0), 0),
        etapa_perdida_promedio: etapaMasComun ? etapaPerdidaMap[etapaMasComun[0]] ?? null : null,
      }
    }).sort((a, b) => b.cantidad - a.cantidad)

    // ── Section 6: Por fuente ────────────────────────────────────────────────

    const fuenteMap = new Map<string, LeadRow[]>()
    for (const l of cualificados) {
      const fuente = l.fuente ?? 'Sin fuente'
      if (!fuenteMap.has(fuente)) fuenteMap.set(fuente, [])
      fuenteMap.get(fuente)!.push(l)
    }

    const FUENTE_LABELS: Record<string, string> = {
      formulario: 'Formulario web', referido: 'Referido', linkedin: 'LinkedIn',
      instagram: 'Instagram', whatsapp: 'WhatsApp', chatbot: 'Chatbot', mail: 'Mail', otro: 'Otro',
    }

    const porFuente = Array.from(fuenteMap.entries()).map(([fuente, fLeads]) => {
      const fGanados = fLeads.filter(l => l.estado_pipeline === 'cliente_ganado')
      const fPerdidos = fLeads.filter(l => l.estado_pipeline === 'cliente_perdido')
      const fProps = fLeads.flatMap(l => l.propuestas ?? [])
      const fPropsAcept = fProps.filter(p => p.estado === 'aceptada')
      const fConPropuesta = fLeads.filter(l => (l.propuestas ?? []).length > 0)

      const ciclo = avg(
        fGanados.filter(l => l.fecha_cierre)
          .map(l => daysDiff(l.fecha_ingreso, l.fecha_cierre))
          .filter((d): d is number => d !== null && d >= 0)
      )

      const ticketARS = avg(fPropsAcept.filter(p => p.moneda === 'ARS').map(p => p.valor_ars ?? 0).filter(v => v > 0))
      const ticketUSD = avg(fPropsAcept.filter(p => p.moneda === 'USD').map(p => p.valor_usd ?? 0).filter(v => v > 0))

      return {
        fuente,
        label: FUENTE_LABELS[fuente] ?? fuente,
        cantidad: fLeads.length,
        ganados: fGanados.length,
        perdidos: fPerdidos.length,
        tasa_cierre: fLeads.length > 0
          ? Math.round((fGanados.length / fLeads.length) * 100 * 10) / 10
          : 0,
        ciclo_venta: ciclo,
        ticket_promedio_ars: ticketARS,
        ticket_promedio_usd: ticketUSD,
        valor_total_ars: fPropsAcept.filter(p => p.moneda === 'ARS').reduce((s, p) => s + (p.valor_ars ?? 0), 0),
        valor_total_usd: fPropsAcept.filter(p => p.moneda === 'USD').reduce((s, p) => s + (p.valor_usd ?? 0), 0),
        tasa_conversion_propuesta: fLeads.length > 0
          ? Math.round((fConPropuesta.length / fLeads.length) * 100 * 10) / 10
          : 0,
      }
    }).sort((a, b) => b.cantidad - a.cantidad)

    // ── Section 7: Ingreso de leads ──────────────────────────────────────────
    // Cuándo entran los leads (hora/día/mes, en horario Argentina) y qué
    // servicios piden — sobre TODOS los leads del período (no solo
    // cualificados), para ver el patrón real de demanda, no solo la buena.
    const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

    const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, count: 0 }))
    const porDiaSemanaRaw = DIAS_SEMANA.map((dia, idx) => ({ dia, idx, count: 0 }))
    const porMesMap = new Map<string, { key: string; mes: string; count: number }>()
    const serviciosMap = new Map<string, number>()

    for (const l of leads) {
      const fechaRaw = l.fecha_ingreso ?? l.created_at
      if (fechaRaw) {
        const argDate = new Date(new Date(fechaRaw).toLocaleString('en-US', { timeZone: TIMEZONE }))
        porHora[argDate.getHours()].count++
        porDiaSemanaRaw[argDate.getDay()].count++
        const key = `${argDate.getFullYear()}-${String(argDate.getMonth() + 1).padStart(2, '0')}`
        const label = `${MESES[argDate.getMonth()]} ${argDate.getFullYear()}`
        porMesMap.set(key, { key, mes: label, count: (porMesMap.get(key)?.count ?? 0) + 1 })
      }
      for (const s of l.servicios_interesados ?? []) {
        serviciosMap.set(s, (serviciosMap.get(s) ?? 0) + 1)
      }
    }

    // Lunes primero, como una semana laboral
    const porDiaSemana = [1, 2, 3, 4, 5, 6, 0].map(i => porDiaSemanaRaw[i])
    const porMes = Array.from(porMesMap.values()).sort((a, b) => a.key.localeCompare(b.key))
    const serviciosTop = Array.from(serviciosMap.entries())
      .map(([servicio, count]) => ({ servicio, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // ── Section 8: LIDIA (bot de WhatsApp) ───────────────────────────────────
    // whatsapp_conversations/wa_messages no traen período propio en la query
    // principal — se cruzan acá contra `leads`/`cualificados` (ya acotados por
    // fecha_ingreso arriba) para saber cuáles de esos leads pasaron por LIDIA.
    type WaConvoRow = { id: string; lead_id: string | null; followup_count: number }
    type WaMsgRow = { id: string; conversation_id: string; body: string | null }

    const [{ data: waConvosRaw }, { data: followupMsgsRaw }] = await Promise.all([
      adminSupabase.from('whatsapp_conversations').select('id, lead_id, followup_count'),
      adminSupabase
        .from('wa_messages')
        .select('id, conversation_id, body')
        .eq('direction', 'outbound')
        .in('body', FOLLOWUP_TEXT)
        .gte('created_at', fechaDesde)
        .lte('created_at', fechaHasta + 'T23:59:59'),
    ])

    const waConvos = (waConvosRaw ?? []) as WaConvoRow[]
    const waConvoMap = new Map(waConvos.map(c => [c.id, c]))
    const waLeadIds = new Set(waConvos.filter(c => c.lead_id).map(c => c.lead_id as string))

    // Leads cualificados del período que tuvieron conversación con LIDIA, y
    // de esos, cuántos confirmaron una reunión — conversión pedida "sobre
    // leads de calidad", no sobre el total de conversaciones.
    const cualificadosConLidia = cualificados.filter(l => waLeadIds.has(l.id))
    const cualificadosConLidiaReunion = cualificadosConLidia.filter(l => !!l.fecha_reunion)
    const conversionLidiaReunion = pct(cualificadosConLidiaReunion.length, cualificadosConLidia.length)

    // Follow-ups automáticos (los 2 mensajes de silencio) enviados en el período
    const followupMsgs = (followupMsgsRaw ?? []) as WaMsgRow[]
    const followupsEnviados = followupMsgs.length
    // De esos, el 2º follow-up (el último) cuya conversación sigue sin
    // respuesta hoy (followup_count no se resetea a 0 salvo que el lead conteste)
    const leadsQuedaronEnFollowUp = followupMsgs.filter(m => {
      if (m.body !== FOLLOWUP_TEXT[FOLLOWUP_TEXT.length - 1]) return false
      const conv = waConvoMap.get(m.conversation_id)
      return !!conv && conv.followup_count >= FOLLOWUP_TEXT.length
    }).length

    // ── Detalle (drill-down) ─────────────────────────────────────────────────
    // Listas reales detrás de cada número del resumen, para que se pueda
    // hacer clic en una métrica y ver exactamente qué leads la componen.
    function trim(list: LeadRow[]) {
      return list.map(l => ({
        id: l.id,
        nombre: [l.nombre, l.apellido].filter(Boolean).join(' '),
        pais: l.pais,
        fuente: l.fuente,
        estado_pipeline: l.estado_pipeline,
        fecha_ingreso: l.fecha_ingreso ?? l.created_at,
      }))
    }

    function trimPropuestas(list: { id: string; lead_id: string; lead_nombre: string; valor_usd: number | null; valor_ars: number | null; moneda: string; estado: string }[]) {
      return list.map(p => ({
        id: p.id,
        lead_id: p.lead_id,
        nombre: `${p.lead_nombre || 'Sin nombre'} — ${p.moneda} ${(p.moneda === 'ARS' ? p.valor_ars : p.valor_usd) ?? 0}`,
        pais: null,
        fuente: null,
        estado_pipeline: p.estado,
        fecha_ingreso: null,
      }))
    }

    const detalle = {
      leads_recibidos: trim(leads),
      cualificados: trim(cualificados),
      no_cualificados: trim(noCualificadoLeads),
      basura: trim(basuraLeads),
      reuniones_agendadas: trim(reunionesAgendadasTotal),
      reuniones_realizadas: trim(reunionesRealizadasTotal),
      reuniones_no_se_presento: trim(reunionesNoSePresento),
      reuniones_sin_informacion: trim(reunionesSinInformacion),
      reuniones_canceladas_alora: trim(reunionesCanceladasAlora),
      con_propuesta: trim(cualificadosConPropuesta),
      ganados: trim(ganados),
      perdidos: trim(perdidos),
      propuestas_enviadas_ars: trimPropuestas(allPropuestasConLead.filter(p => p.moneda === 'ARS')),
      propuestas_enviadas_usd: trimPropuestas(allPropuestasConLead.filter(p => p.moneda === 'USD')),
      propuestas_ganadas_ars: trimPropuestas(propuestasDeGanados.filter(p => p.moneda === 'ARS')),
      propuestas_ganadas_usd: trimPropuestas(propuestasDeGanados.filter(p => p.moneda === 'USD')),
      propuestas_perdidas_ars: trimPropuestas(propuestasDePerdidos.filter(p => p.moneda === 'ARS')),
      propuestas_perdidas_usd: trimPropuestas(propuestasDePerdidos.filter(p => p.moneda === 'USD')),
      lidia_con_reunion: trim(cualificadosConLidiaReunion),
      lidia_conversaciones: trim(cualificadosConLidia),
    }

    // ── Response ─────────────────────────────────────────────────────────────

    return NextResponse.json({
      resumen: {
        total_leads: totalLeads,
        cierres_ganados: ganados.length,
        cierres_perdidos: perdidos.length,
        tasa_cierre_ganado: tasaCierreGanado,
        tasa_conversion_propuesta: tasaConversionPropuesta,
        tasa_perdida_propuesta: tasaPerdidaPropuesta,
        ciclo_venta_promedio: cicloVentaPromedio,
        tiempo_ingreso_propuesta_aceptada: tiempoIngresoAceptada,
        tiempo_propuesta_aceptacion: tiempoPropuestaAceptacion,
        propuestas_enviadas_ars: Math.round(propuestasEnviadasARS),
        propuestas_enviadas_usd: Math.round(propuestasEnviadasUSD),
        propuestas_ganadas_ars: Math.round(propuestasGanadasARS),
        propuestas_ganadas_usd: Math.round(propuestasGanadasUSD),
        propuestas_perdidas_ars: Math.round(propuestasPerdidasARS),
        propuestas_perdidas_usd: Math.round(propuestasPerdidasUSD),
        propuestas_count: propuestasEnviadas.length,
        propuestas_aceptadas_count: propuestasAceptadas.length,
        propuestas_rechazadas_count: propuestasRechazadas.length,
      },
      calidad: {
        total: totalLeads,
        basura_count: basuraLeads.length,
        basura_pct: pct(basuraLeads.length, totalLeads),
        no_cualificado_count: noCualificadoLeads.length,
        no_cualificado_pct: pct(noCualificadoLeads.length, totalLeads),
        cualificado_count: cualificadoCount,
        cualificado_pct: pct(cualificadoCount, totalLeads),
      },
      reuniones: {
        agendadas: reunionesAgendadasTotal.length,
        realizadas: reunionesRealizadasTotal.length,
        canceladas_alora: reunionesCanceladasAlora.length,
        no_se_presento: reunionesNoSePresento.length,
        sin_informacion: reunionesSinInformacion.length,
        show_up_rate: showUpRateTotal,
      },
      conversiones: {
        lead_a_reunion: conversionLeadReunion,
        lead_a_propuesta: conversionLeadPropuesta,
        reunion_a_propuesta: conversionReunionPropuesta,
      },
      // Texto para los tooltips ⓘ del frontend — una sola fuente de verdad,
      // así la definición nunca queda desincronizada del cálculo real.
      definiciones: {
        total_leads: 'Todas las consultas recibidas en el período, incluyendo Basura y No cualificado. Excluye Consulta de cliente existente y Testing (no son leads nuevos).',
        cualificado_pct: 'Leads cuya consulta original era algo que ALORA puede resolver — independiente de si convirtieron. Incluye Sin respuesta, Ghosting, Ganado y Perdido. Solo excluye Basura y No cualificado.',
        no_cualificado_pct: 'Hubo respuesta/diálogo real, pero se evaluó que ALORA no puede o no debe resolver esa necesidad.',
        basura_pct: 'Ni siquiera era una consulta real (spam, número equivocado, algo no relacionado con ALORA). No cuenta como lead.',
        reuniones_agendadas: 'Leads con fecha, hora y link de reunión cargados — sin importar el origen (TidyCal, bot de WhatsApp, carga manual) ni si el lead se reclasificó después a No cualificado (la reunión igual pasó). Mide agenda, no asistencia.',
        reuniones_realizadas: 'De las agendadas, las que se confirmaron manualmente en la ficha del lead como "se presentó" — incluye leads reclasificados a No cualificado después de la reunión. Antes del 17/08/2026 este dato es poco confiable por una carga masiva histórica vía TidyCal.',
        reuniones_canceladas_alora: 'Reuniones que ALORA decidió no dar (ej. tras más charla por WhatsApp el lead no da la talla) — no cuentan como "no show" del lead ni bajan el show-up rate. Se mide por cuándo se marcó la cancelación, no por cuándo ingresó el lead.',
        reuniones_no_se_presento: 'De las agendadas, las que se confirmaron manualmente en la ficha del lead como "no se presentó".',
        reuniones_sin_informacion: 'De las agendadas, las que todavía nadie confirmó en la ficha del lead (ni se presentó, ni no se presentó, ni cancelada por ALORA) — hacé clic para verlas y completarlas.',
        show_up_rate: 'Reuniones realizadas ÷ reuniones agendadas. Cuántas de las reuniones que se agendan realmente se concretan.',
        tasa_cierre_ganado: 'Cierres ganados ÷ leads cualificados del período (no se cuentan Basura ni No cualificado en la base, porque nunca iban a cerrar).',
        lead_a_reunion: 'Reuniones agendadas ÷ leads cualificados.',
        lead_a_propuesta: 'Leads cualificados con al menos una propuesta real cargada (tabla de propuestas, no el simple movimiento de la tarjeta) ÷ leads cualificados.',
        reunion_a_propuesta: 'Leads con propuesta real ÷ reuniones realizadas (confirmadas).',
        propuestas_count: 'Propuestas reales cargadas en el sistema (con monto), no tarjetas que pasaron por la columna "Propuesta enviada" sin una propuesta real detrás.',
        tasa_perdida_propuesta: 'Propuestas rechazadas ÷ propuestas enviadas en el período.',
        propuestas_perdidas_ars: 'Monto de propuestas en ARS rechazadas de leads que cerraron como "Cliente perdido" en el período (por fecha de cierre, igual que las ganadas).',
        propuestas_perdidas_usd: 'Monto de propuestas en USD rechazadas de leads que cerraron como "Cliente perdido" en el período (por fecha de cierre, igual que las ganadas).',
        lidia_conversion_reunion: 'De los leads cualificados del período que tuvieron conversación con Lidia por WhatsApp, cuántos confirmaron una reunión.',
        lidia_followups_enviados: 'Mensajes automáticos de seguimiento que Lidia manda cuando el lead queda en silencio (a los 30 min y a las 24 hs) — hasta 2 por conversación.',
        lidia_leads_en_frio: 'Conversaciones donde Lidia mandó los 2 follow-ups automáticos y el lead nunca respondió — se enfriaron.',
      },
      funnel,
      tiempos,
      propuestas: propuestasPorMoneda,
      por_pais: porPais,
      por_fuente: porFuente,
      ingreso_leads: {
        por_hora: porHora,
        por_dia_semana: porDiaSemana,
        por_mes: porMes,
        servicios_top: serviciosTop,
      },
      lidia: {
        conversaciones: cualificadosConLidia.length,
        reuniones_confirmadas: cualificadosConLidiaReunion.length,
        conversion_reunion: conversionLidiaReunion,
        followups_enviados: followupsEnviados,
        leads_en_frio: leadsQuedaronEnFollowUp,
      },
      detalle,
    })
  } catch (error) {
    console.error('[analytics] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
