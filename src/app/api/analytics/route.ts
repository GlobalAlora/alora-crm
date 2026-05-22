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

// ── Stage → funnel mapping ────────────────────────────────────────────────────

// Which funnel stage a "perdido" lead was at (based on date fields)
function perdidoEnEtapa(lead: LeadRow): 'ingreso' | 'contactado' | 'reunion' | 'propuesta' {
  if (lead.fecha_propuesta || (lead.propuestas ?? []).length > 0) return 'propuesta'
  if (lead.fecha_reunion) return 'reunion'
  if (lead.fecha_contacto) return 'contactado'
  return 'ingreso'
}

// Risk thresholds in days per stage
const RISK_THRESHOLDS: Record<string, number> = {
  lead_entrante:       3,
  lead_contactado:     7,
  sin_respuesta:       7,
  reunion_reservada:   5,
  reunion_realizada:   5,
  propuesta_en_armado: 5,
  propuesta_enviada:   14,
  follow_up:           14,
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
  fecha_ingreso: string
  fecha_contacto: string | null
  fecha_reunion: string | null
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

    // ── Main query: leads in period ─────────────────────────────────────────
    let leadsQuery = adminSupabase
      .from('leads')
      .select(`
        id, nombre, apellido, pais, fuente, estado_pipeline,
        fecha_ingreso, fecha_contacto, fecha_reunion, fecha_propuesta, fecha_cierre,
        stage_updated_at, last_activity_at,
        propuestas(id, valor_usd, valor_ars, moneda, estado, created_at, updated_at)
      `)
      .is('deleted_at', null)
      .gte('fecha_ingreso', fechaDesde)
      .lte('fecha_ingreso', fechaHasta + 'T23:59:59')

    if (paisFilter) leadsQuery = leadsQuery.eq('pais', paisFilter)
    if (fuenteFilter) leadsQuery = leadsQuery.eq('fuente', fuenteFilter)

    // Active leads for risk section (no date filter)
    const [leadsResult, activeResult] = await Promise.all([
      leadsQuery,
      adminSupabase
        .from('leads')
        .select('id, nombre, apellido, pais, fuente, estado_pipeline, stage_updated_at, last_activity_at')
        .is('deleted_at', null)
        .not('estado_pipeline', 'in', '(cliente_ganado,cliente_perdido,no_cualificado)'),
    ])

    const leads: LeadRow[] = (leadsResult.data ?? []) as unknown as LeadRow[]
    const activeLeads: ActiveLead[] = (activeResult.data ?? []) as ActiveLead[]

    // Flatten all propuestas for the period
    const allPropuestas = leads.flatMap(l => l.propuestas ?? [])

    // ── Section 1: Resumen Ejecutivo ─────────────────────────────────────────

    const totalLeads = leads.length
    const ganados = leads.filter(l => l.estado_pipeline === 'cliente_ganado')
    const perdidos = leads.filter(l => l.estado_pipeline === 'cliente_perdido')

    const tasaCierreGanado = totalLeads > 0
      ? Math.round((ganados.length / totalLeads) * 100 * 10) / 10
      : 0

    const propuestasEnviadas = allPropuestas
    const propuestasAceptadas = allPropuestas.filter(p => p.estado === 'aceptada')
    const tasaConversionPropuesta = propuestasEnviadas.length > 0
      ? Math.round((propuestasAceptadas.length / propuestasEnviadas.length) * 100 * 10) / 10
      : 0

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
    const propuestasGanadasARS = propuestasAceptadas.filter(p => p.moneda === 'ARS').reduce((s, p) => s + (p.valor_ars ?? 0), 0)
    const propuestasGanadasUSD = propuestasAceptadas.filter(p => p.moneda === 'USD').reduce((s, p) => s + (p.valor_usd ?? 0), 0)

    // ── Section 2: Funnel ────────────────────────────────────────────────────

    const funnelStages = [
      { key: 'ingreso',    label: 'Ingreso de lead',      count: leads.length },
      { key: 'contactado', label: 'Contactado',           count: leads.filter(l => !!l.fecha_contacto).length },
      { key: 'reunion',    label: 'Reunión realizada',    count: leads.filter(l => !!l.fecha_reunion).length },
      { key: 'propuesta',  label: 'Propuesta enviada',    count: leads.filter(l => !!l.fecha_propuesta || (l.propuestas ?? []).length > 0).length },
      { key: 'ganado',     label: 'Cierre ganado',        count: ganados.length },
    ]

    // Perdidos por etapa
    const perdidosPorEtapa: Record<string, number> = {
      ingreso: 0, contactado: 0, reunion: 0, propuesta: 0,
    }
    for (const l of perdidos) {
      perdidosPorEtapa[perdidoEnEtapa(l)]++
    }

    const funnel = funnelStages.map((stage, idx) => ({
      key: stage.key,
      label: stage.label,
      cantidad: stage.count,
      tasa_vs_anterior: idx === 0 || funnelStages[idx - 1].count === 0
        ? null
        : Math.round((stage.count / funnelStages[idx - 1].count) * 100 * 10) / 10,
      tasa_acumulada: leads.length === 0 ? 0
        : Math.round((stage.count / leads.length) * 100 * 10) / 10,
      perdidos: perdidosPorEtapa[stage.key] ?? 0,
    }))

    // ── Section 3: Tiempos entre etapas ─────────────────────────────────────

    const tiempos = {
      ingreso_contacto: avg(
        leads.filter(l => l.fecha_contacto)
          .map(l => daysDiff(l.fecha_ingreso, l.fecha_contacto))
          .filter((d): d is number => d !== null && d >= 0)
      ),
      contacto_reunion: avg(
        leads.filter(l => l.fecha_contacto && l.fecha_reunion)
          .map(l => daysDiff(l.fecha_contacto, l.fecha_reunion))
          .filter((d): d is number => d !== null && d >= 0)
      ),
      reunion_propuesta: avg(
        leads.filter(l => l.fecha_reunion && l.fecha_propuesta)
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
    for (const l of leads) {
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
        ingreso: 'Ingreso', contactado: 'Contactado', reunion: 'Reunión', propuesta: 'Propuesta',
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
    for (const l of leads) {
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
      const fConPropuesta = fLeads.filter(l => l.fecha_propuesta || (l.propuestas ?? []).length > 0)

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

    // ── Response ─────────────────────────────────────────────────────────────

    return NextResponse.json({
      resumen: {
        total_leads: totalLeads,
        cierres_ganados: ganados.length,
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
      funnel,
      tiempos,
      propuestas: propuestasPorMoneda,
      por_pais: porPais,
      por_fuente: porFuente,
      leads_en_riesgo: leadsEnRiesgo,
    })
  } catch (error) {
    console.error('[analytics] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
