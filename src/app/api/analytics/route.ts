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

// Risk thresholds in days per stage. Includes the custom stages added via
// Configuración → Pipeline (ghosting, no_asistio_a_reunion__follow_up) —
// previously missing here entirely, so those leads never triggered a "en
// riesgo" alert no matter how long they sat stale (found 2026-08-17).
const RISK_THRESHOLDS: Record<string, number> = {
  lead_entrante:       3,
  lead_contactado:     7,
  sin_respuesta:       7,
  reunion_reservada:   5,
  reunion_realizada:   5,
  propuesta_en_armado: 5,
  propuesta_enviada:   14,
  follow_up:           14,
  ghosting:            7,
  no_asistio_a_reunion__follow_up: 3,
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
  fecha_propuesta: string | null
  fecha_cierre: string | null
  stage_updated_at: string
  last_activity_at: string
  propuestas: Propuesta[] | null
}

type ActiveLead = {
  id: string
  nombre: string
  apellido: string | null
  pais: string | null
  fuente: string | null
  estado_pipeline: string
  stage_updated_at: string
  last_activity_at: string
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
    const ACTIVE_STAGES_OR = [
      'lead_entrante', 'lead_contactado', 'sin_respuesta', 'reunion_reservada',
      'reunion_realizada', 'propuesta_en_armado', 'propuesta_enviada', 'follow_up',
      'ghosting', 'no_asistio_a_reunion__follow_up',
    ].map(s => `estado_pipeline.eq.${s}`).join(',')

    // ── Main query: leads in period ─────────────────────────────────────────
    // Use OR so leads with null fecha_ingreso fall back to created_at for date check
    let leadsQuery = adminSupabase
      .from('leads')
      .select(`
        id, nombre, apellido, pais, fuente, estado_pipeline,
        fecha_ingreso, fecha_contacto, fecha_reunion, reunion_asistencia, fecha_propuesta, fecha_cierre,
        stage_updated_at, last_activity_at, created_at,
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
        fecha_ingreso, fecha_contacto, fecha_reunion, reunion_asistencia, fecha_propuesta, fecha_cierre,
        stage_updated_at, last_activity_at, created_at,
        propuestas(id, valor_usd, valor_ars, moneda, estado, created_at, updated_at)
      `)
      .is('deleted_at', null)
      .in('estado_pipeline', ['cliente_ganado', 'cliente_perdido'])
      .gte('fecha_cierre', fechaDesde)
      .lte('fecha_cierre', fechaHasta + 'T23:59:59')

    // Active leads for risk section (no date filter) — use .or() instead of .not().in()
    const [leadsResult, cierresResult, activeResult] = await Promise.all([
      leadsQuery,
      cierresQuery,
      adminSupabase
        .from('leads')
        .select('id, nombre, apellido, pais, fuente, estado_pipeline, stage_updated_at, last_activity_at')
        .is('deleted_at', null)
        .or(ACTIVE_STAGES_OR),
    ])

    // Filter excluded stages in JS
    const leads: LeadRow[] = ((leadsResult.data ?? []) as unknown as LeadRow[])
      .filter(l => !EXCLUDED.has(l.estado_pipeline))
    // Leads closed in period (by fecha_cierre) — used for resumen KPIs
    const cierresEnPeriodo: LeadRow[] = (cierresResult.data ?? []) as unknown as LeadRow[]
    const activeLeads: ActiveLead[] = (activeResult.data ?? []) as ActiveLead[]

    // Flatten all propuestas for the period (leads ingresados)
    const allPropuestas = leads.flatMap(l => l.propuestas ?? [])

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
    const reunionesAgendadas = cualificados.filter(l => !!l.fecha_reunion)
    const reunionesRealizadas = cualificados.filter(l => l.reunion_asistencia === 'se_presento')
    const showUpRate = pct(reunionesRealizadas.length, reunionesAgendadas.length)

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
    const propuestasDeGanados = ganados.flatMap(l => (l.propuestas ?? []).filter(p => p.estado === 'aceptada'))
    const propuestasGanadasARS = propuestasDeGanados.filter(p => p.moneda === 'ARS').reduce((s, p) => s + (p.valor_ars ?? 0), 0)
    const propuestasGanadasUSD = propuestasDeGanados.filter(p => p.moneda === 'USD').reduce((s, p) => s + (p.valor_usd ?? 0), 0)

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

    // ── Section 7: Leads en riesgo ───────────────────────────────────────────

    const now = Date.now()
    const leadsEnRiesgo = activeLeads
      .map(l => {
        const threshold = RISK_THRESHOLDS[l.estado_pipeline]
        if (!threshold) return null
        const diasEnEtapa = Math.floor((now - new Date(l.stage_updated_at).getTime()) / 86_400_000)
        if (diasEnEtapa < threshold) return null
        return {
          id: l.id,
          nombre: [l.nombre, l.apellido].filter(Boolean).join(' '),
          pais: l.pais,
          fuente: l.fuente,
          etapa: l.estado_pipeline,
          dias_en_etapa: diasEnEtapa,
          ultima_actividad: l.last_activity_at,
          umbral: threshold,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b!.dias_en_etapa - a!.dias_en_etapa)
      .slice(0, 30) // max 30

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

    const detalle = {
      leads_recibidos: trim(leads),
      cualificados: trim(cualificados),
      no_cualificados: trim(noCualificadoLeads),
      basura: trim(basuraLeads),
      reuniones_agendadas: trim(reunionesAgendadas),
      reuniones_realizadas: trim(reunionesRealizadas),
      con_propuesta: trim(cualificadosConPropuesta),
      ganados: trim(ganados),
      perdidos: trim(perdidos),
    }

    // ── Response ─────────────────────────────────────────────────────────────

    return NextResponse.json({
      resumen: {
        total_leads: totalLeads,
        cierres_ganados: ganados.length,
        cierres_perdidos: perdidos.length,
        tasa_cierre_ganado: tasaCierreGanado,
        tasa_conversion_propuesta: tasaConversionPropuesta,
        ciclo_venta_promedio: cicloVentaPromedio,
        tiempo_ingreso_propuesta_aceptada: tiempoIngresoAceptada,
        tiempo_propuesta_aceptacion: tiempoPropuestaAceptacion,
        propuestas_enviadas_ars: Math.round(propuestasEnviadasARS),
        propuestas_enviadas_usd: Math.round(propuestasEnviadasUSD),
        propuestas_ganadas_ars: Math.round(propuestasGanadasARS),
        propuestas_ganadas_usd: Math.round(propuestasGanadasUSD),
        propuestas_count: propuestasEnviadas.length,
        propuestas_aceptadas_count: propuestasAceptadas.length,
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
        agendadas: reunionesAgendadas.length,
        realizadas: reunionesRealizadas.length,
        show_up_rate: showUpRate,
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
        reuniones_agendadas: 'Leads con fecha, hora y link de reunión cargados — sin importar el origen (TidyCal, bot de WhatsApp, carga manual). Mide agenda, no asistencia.',
        reuniones_realizadas: 'De las agendadas, las que se confirmaron manualmente en la ficha del lead como "se presentó". Antes del 17/08/2026 este dato es poco confiable por una carga masiva histórica vía TidyCal.',
        show_up_rate: 'Reuniones realizadas ÷ reuniones agendadas. Cuántas de las reuniones que se agendan realmente se concretan.',
        tasa_cierre_ganado: 'Cierres ganados ÷ leads cualificados del período (no se cuentan Basura ni No cualificado en la base, porque nunca iban a cerrar).',
        lead_a_reunion: 'Reuniones agendadas ÷ leads cualificados.',
        lead_a_propuesta: 'Leads cualificados con al menos una propuesta real cargada (tabla de propuestas, no el simple movimiento de la tarjeta) ÷ leads cualificados.',
        reunion_a_propuesta: 'Leads con propuesta real ÷ reuniones realizadas (confirmadas).',
        propuestas_count: 'Propuestas reales cargadas en el sistema (con monto), no tarjetas que pasaron por la columna "Propuesta enviada" sin una propuesta real detrás.',
      },
      funnel,
      tiempos,
      propuestas: propuestasPorMoneda,
      por_pais: porPais,
      por_fuente: porFuente,
      leads_en_riesgo: leadsEnRiesgo,
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
