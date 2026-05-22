'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, Users, Clock, Target, AlertTriangle,
  DollarSign, BarChart3, Globe, Zap, ChevronRight,
  ArrowRight, ArrowDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatUSD, formatARS } from '@/lib/utils'
import { FUENTES, PAISES, PIPELINE_STAGE_MAP } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  resumen: {
    total_leads: number
    cierres_ganados: number
    tasa_cierre_ganado: number
    tasa_conversion_propuesta: number
    ciclo_venta_promedio: number | null
    tiempo_ingreso_propuesta_aceptada: number | null
    tiempo_propuesta_aceptacion: number | null
    propuestas_enviadas_ars: number
    propuestas_enviadas_usd: number
    propuestas_ganadas_ars: number
    propuestas_ganadas_usd: number
    propuestas_count: number
    propuestas_aceptadas_count: number
  }
  funnel: {
    key: string
    label: string
    cantidad: number
    tasa_vs_anterior: number | null
    tasa_acumulada: number
    perdidos: number
  }[]
  tiempos: {
    ingreso_contacto: number | null
    contacto_reunion: number | null
    reunion_propuesta: number | null
    propuesta_cierre_ganado: number | null
    propuesta_cierre_perdido: number | null
  }
  propuestas: {
    moneda: 'ARS' | 'USD'
    total_enviadas: number
    aceptadas: number
    rechazadas: number
    tasa_aceptacion: number
    ticket_promedio_ganado: number | null
    ticket_promedio_perdido: number | null
    tiempo_promedio_aceptacion: number | null
  }[]
  por_pais: {
    pais: string
    cantidad: number
    ganados: number
    tasa_cierre: number
    ciclo_venta: number | null
    ticket_promedio_ars: number | null
    ticket_promedio_usd: number | null
    valor_total_ars: number
    valor_total_usd: number
    etapa_perdida_promedio: string | null
  }[]
  por_fuente: {
    fuente: string
    label: string
    cantidad: number
    ganados: number
    perdidos: number
    tasa_cierre: number
    ciclo_venta: number | null
    ticket_promedio_ars: number | null
    ticket_promedio_usd: number | null
    valor_total_ars: number
    valor_total_usd: number
    tasa_conversion_propuesta: number
  }[]
  leads_en_riesgo: {
    id: string
    nombre: string
    pais: string | null
    fuente: string | null
    etapa: string
    dias_en_etapa: number
    ultima_actividad: string | null
    umbral: number
  }[]
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchAnalytics(params: Record<string, string>): Promise<AnalyticsData> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`/api/analytics?${qs}`)
  if (!res.ok) throw new Error('Error al cargar analytics')
  return res.json()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDefaultDesde() {
  return new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0]
}

function getDefaultHasta() {
  return new Date().toISOString().split('T')[0]
}

function dias(d: number | null) {
  if (d === null) return <span className="text-slate-400">—</span>
  return <span>{d} día{d !== 1 ? 's' : ''}</span>
}

function pct(v: number | null) {
  if (v === null) return <span className="text-slate-400">—</span>
  return <span>{v}%</span>
}

function quickPreset(label: string, desde: string, hasta: string, setDesde: (s: string) => void, setHasta: (s: string) => void) {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const map: Record<string, [string, string]> = {
    '7d':  [new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0], todayStr],
    '30d': [new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0], todayStr],
    '90d': [new Date(Date.now() - 90 * 86_400_000).toISOString().split('T')[0], todayStr],
    'mes': [
      new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
      todayStr,
    ],
    'trimestre': [
      new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1).toISOString().split('T')[0],
      todayStr,
    ],
    'año': [
      new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0],
      todayStr,
    ],
  }
  const [d, h] = map[label] ?? [desde, hasta]
  setDesde(d)
  setHasta(h)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon size={15} className="text-slate-600" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function StatCard({
  label, value, sub, color = 'slate', large = false,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  color?: 'slate' | 'green' | 'blue' | 'amber' | 'red' | 'purple'
  large?: boolean
}) {
  const colors = {
    slate:  'bg-white border-slate-200',
    green:  'bg-emerald-50 border-emerald-200',
    blue:   'bg-blue-50 border-blue-200',
    amber:  'bg-amber-50 border-amber-200',
    red:    'bg-red-50 border-red-200',
    purple: 'bg-violet-50 border-violet-200',
  }
  const textColors = {
    slate:  'text-slate-900',
    green:  'text-emerald-800',
    blue:   'text-blue-800',
    amber:  'text-amber-800',
    red:    'text-red-800',
    purple: 'text-violet-800',
  }
  return (
    <div className={cn('rounded-xl border p-4 space-y-1', colors[color])}>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={cn('font-bold leading-tight', large ? 'text-2xl' : 'text-xl', textColors[color])}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500 pt-0.5">{sub}</p>}
    </div>
  )
}

function Skeleton({ h = 'h-24' }: { h?: string }) {
  return <div className={cn('rounded-xl bg-slate-100 animate-pulse w-full', h)} />
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const router = useRouter()
  const [fechaDesde, setFechaDesde] = useState(getDefaultDesde)
  const [fechaHasta, setFechaHasta] = useState(getDefaultHasta)
  const [pais, setPais] = useState('')
  const [fuente, setFuente] = useState('')

  const params = useMemo(() => {
    const p: Record<string, string> = {
      fecha_desde: fechaDesde,
      fecha_hasta: fechaHasta,
    }
    if (pais) p.pais = pais
    if (fuente) p.fuente = fuente
    return p
  }, [fechaDesde, fechaHasta, pais, fuente])

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', params],
    queryFn: () => fetchAnalytics(params),
    staleTime: 60_000,
  })

  const d = data
  const PRESETS = ['7d', '30d', '90d', 'mes', 'trimestre', 'año']
  const PRESET_LABELS: Record<string, string> = {
    '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', '90d': 'Últimos 90 días',
    mes: 'Este mes', trimestre: 'Este trimestre', año: 'Este año',
  }

  return (
    <div className="space-y-8 pb-16">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Analíticas</h1>
          <p className="text-sm text-slate-500 mt-0.5">KPIs del proceso comercial por período</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(preset => (
            <button
              key={preset}
              onClick={() => quickPreset(preset, fechaDesde, fechaHasta, setFechaDesde, setFechaHasta)}
              className="text-xs px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition-colors"
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={e => setFechaDesde(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={e => setFechaHasta(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">País</label>
            <select
              value={pais}
              onChange={e => setPais(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Todos los países</option>
              {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Fuente</label>
            <select
              value={fuente}
              onChange={e => setFuente(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Todas las fuentes</option>
              {FUENTES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Sección 1: Resumen Ejecutivo ────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <SectionHeader icon={Target} title="Resumen ejecutivo" subtitle="Métricas clave del período seleccionado" />

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} />)}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Row 1: Volume + rates */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Leads ingresados"
                value={d?.resumen.total_leads ?? 0}
                sub={`${d?.resumen.cierres_ganados ?? 0} cerrados ganados`}
                color="blue"
                large
              />
              <StatCard
                label="Tasa de cierre ganado"
                value={`${d?.resumen.tasa_cierre_ganado ?? 0}%`}
                sub="Leads ganados / leads ingresados"
                color={
                  (d?.resumen.tasa_cierre_ganado ?? 0) >= 20 ? 'green' :
                  (d?.resumen.tasa_cierre_ganado ?? 0) >= 10 ? 'amber' : 'red'
                }
                large
              />
              <StatCard
                label="Conversión de propuesta"
                value={`${d?.resumen.tasa_conversion_propuesta ?? 0}%`}
                sub={`${d?.resumen.propuestas_aceptadas_count ?? 0} / ${d?.resumen.propuestas_count ?? 0} propuestas`}
                color={
                  (d?.resumen.tasa_conversion_propuesta ?? 0) >= 50 ? 'green' :
                  (d?.resumen.tasa_conversion_propuesta ?? 0) >= 30 ? 'amber' : 'slate'
                }
                large
              />
              <StatCard
                label="Ciclo de venta promedio"
                value={d?.resumen.ciclo_venta_promedio !== null ? `${d!.resumen.ciclo_venta_promedio}d` : '—'}
                sub="Ingreso → cierre ganado"
                color="purple"
                large
              />
            </div>

            {/* Row 2: Time metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StatCard
                label="Tiempo promedio: ingreso → propuesta aceptada"
                value={d?.resumen.tiempo_ingreso_propuesta_aceptada !== null ? `${d!.resumen.tiempo_ingreso_propuesta_aceptada} días` : '—'}
                sub="Duración total del proceso comercial completo"
              />
              <StatCard
                label="Tiempo promedio: propuesta enviada → aceptada"
                value={d?.resumen.tiempo_propuesta_aceptacion !== null ? `${d!.resumen.tiempo_propuesta_aceptacion} días` : '—'}
                sub="Cuánto tarda el cliente en decidir tras recibir la propuesta"
              />
            </div>

            {/* Row 3: Revenue */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Propuestas enviadas ARS"
                value={formatARS(d?.resumen.propuestas_enviadas_ars ?? 0)}
                sub="Total propuestas en período"
              />
              <StatCard
                label="Propuestas enviadas USD"
                value={formatUSD(d?.resumen.propuestas_enviadas_usd ?? 0)}
                sub="Total propuestas en período"
              />
              <StatCard
                label="Propuestas ganadas ARS"
                value={formatARS(d?.resumen.propuestas_ganadas_ars ?? 0)}
                sub="Solo propuestas aceptadas"
                color={(d?.resumen.propuestas_ganadas_ars ?? 0) > 0 ? 'green' : 'slate'}
              />
              <StatCard
                label="Propuestas ganadas USD"
                value={formatUSD(d?.resumen.propuestas_ganadas_usd ?? 0)}
                sub="Solo propuestas aceptadas"
                color={(d?.resumen.propuestas_ganadas_usd ?? 0) > 0 ? 'green' : 'slate'}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Sección 2: Embudo ────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <SectionHeader icon={BarChart3} title="Embudo de conversión" subtitle="Cuántos leads pasan de una etapa a la siguiente" />

        {isLoading ? (
          <Skeleton h="h-48" />
        ) : !d?.funnel.length ? (
          <p className="text-sm text-slate-400 text-center py-8">Sin datos para el período</p>
        ) : (
          <div className="space-y-3">
            {d.funnel.map((stage, idx) => {
              const maxCount = d.funnel[0]?.cantidad ?? 1
              const barPct = maxCount > 0 ? (stage.cantidad / maxCount) * 100 : 0
              const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#0ea5e9', '#22c55e']
              const barColor = colors[idx] ?? '#94a3b8'

              return (
                <div key={stage.key} className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-600 w-36 flex-shrink-0">{stage.label}</span>
                    <div className="flex-1 h-7 bg-slate-100 rounded-md overflow-hidden relative">
                      <div
                        className="h-full rounded-md flex items-center px-3 transition-all duration-700"
                        style={{ width: `${barPct}%`, backgroundColor: barColor }}
                      >
                        {barPct > 15 && (
                          <span className="text-white text-xs font-semibold">{stage.cantidad}</span>
                        )}
                      </div>
                      {barPct <= 15 && (
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-700 text-xs font-semibold">{stage.cantidad}</span>
                      )}
                    </div>
                    <div className="flex gap-3 items-center flex-shrink-0 w-40 text-right justify-end">
                      {stage.tasa_vs_anterior !== null && (
                        <span className={cn(
                          'text-xs font-medium px-2 py-0.5 rounded',
                          stage.tasa_vs_anterior >= 70 ? 'bg-green-100 text-green-700' :
                          stage.tasa_vs_anterior >= 40 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        )}>
                          {stage.tasa_vs_anterior}%
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{stage.tasa_acumulada}% total</span>
                    </div>
                  </div>

                  {/* Perdidos indicator */}
                  {stage.perdidos > 0 && (
                    <div className="ml-36 flex items-center gap-1.5">
                      <ArrowDown size={10} className="text-red-400" />
                      <span className="text-xs text-red-500">
                        {stage.perdidos} perdido{stage.perdidos !== 1 ? 's' : ''} en esta etapa
                      </span>
                    </div>
                  )}

                  {/* Arrow between stages */}
                  {idx < d.funnel.length - 1 && (
                    <div className="ml-36 pl-1">
                      <ChevronRight size={12} className="text-slate-300 rotate-90" />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Total perdidos summary */}
            {d.funnel.reduce((sum, s) => sum + s.perdidos, 0) > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">Leads perdidos por etapa</p>
                <div className="flex flex-wrap gap-2">
                  {d.funnel.filter(s => s.perdidos > 0).map(s => (
                    <span key={s.key} className="text-xs bg-red-50 text-red-600 border border-red-100 px-2.5 py-1 rounded-md">
                      {s.label}: <strong>{s.perdidos}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Sección 3: Tiempos entre etapas ─────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <SectionHeader icon={Clock} title="Tiempos entre etapas" subtitle="Días promedio para avanzar de una etapa a la siguiente" />

        {isLoading ? (
          <Skeleton h="h-36" />
        ) : (
          <div className="space-y-3">
            {[
              {
                from: 'Ingreso', to: 'Primer contacto', value: d?.tiempos.ingreso_contacto ?? null,
                insight: 'Velocidad de respuesta del equipo',
                alert: (v: number) => v > 1,
              },
              {
                from: 'Contacto', to: 'Reunión', value: d?.tiempos.contacto_reunion ?? null,
                insight: 'Eficacia del seguimiento post-contacto',
                alert: (v: number) => v > 7,
              },
              {
                from: 'Reunión', to: 'Propuesta enviada', value: d?.tiempos.reunion_propuesta ?? null,
                insight: 'Tiempo de preparación interna de propuesta',
                alert: (v: number) => v > 5,
              },
              {
                from: 'Propuesta enviada', to: 'Cierre ganado', value: d?.tiempos.propuesta_cierre_ganado ?? null,
                insight: 'Tiempo de decisión del cliente (ganado)',
                alert: (v: number) => v > 14,
              },
              {
                from: 'Propuesta enviada', to: 'Cierre perdido', value: d?.tiempos.propuesta_cierre_perdido ?? null,
                insight: 'Tiempo de decisión del cliente (perdido)',
                alert: (_: number) => false,
                muted: true,
              },
            ].map((row, i) => {
              const isAlert = row.value !== null && row.alert(row.value)
              return (
                <div key={i} className={cn(
                  'flex items-center gap-4 p-3 rounded-lg',
                  isAlert ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'
                )}>
                  <div className="flex items-center gap-2 text-xs text-slate-600 w-52 flex-shrink-0">
                    <span className={cn('font-medium', row.muted && 'text-slate-400')}>{row.from}</span>
                    <ArrowRight size={11} className="text-slate-400" />
                    <span className={cn('font-medium', row.muted && 'text-slate-400')}>{row.to}</span>
                  </div>
                  <div className={cn(
                    'text-xl font-bold w-20 flex-shrink-0',
                    isAlert ? 'text-amber-700' :
                    row.value !== null ? 'text-slate-800' : 'text-slate-300'
                  )}>
                    {row.value !== null ? `${row.value}d` : '—'}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-500">{row.insight}</p>
                    {isAlert && (
                      <p className="text-xs text-amber-600 mt-0.5 font-medium">⚠️ Por encima del umbral recomendado</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Sección 4: Análisis de propuestas ───────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <SectionHeader icon={DollarSign} title="Análisis de propuestas" subtitle="Desglosado por moneda — ARS y USD no se mezclan ni convierten" />

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton h="h-48" />
            <Skeleton h="h-48" />
          </div>
        ) : !d?.propuestas.length ? (
          <p className="text-sm text-slate-400 text-center py-8">Sin propuestas en el período</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {d.propuestas.map(prop => {
              const formatVal = prop.moneda === 'ARS' ? formatARS : formatUSD
              const ticketAlerta = prop.ticket_promedio_perdido !== null &&
                prop.ticket_promedio_ganado !== null &&
                prop.ticket_promedio_perdido > prop.ticket_promedio_ganado

              return (
                <div key={prop.moneda} className="border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">Moneda: {prop.moneda}</span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
                      {prop.total_enviadas} propuesta{prop.total_enviadas !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Accept/reject bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                      <span>Aceptadas: <strong className="text-emerald-600">{prop.aceptadas}</strong></span>
                      <span>Rechazadas: <strong className="text-red-500">{prop.rechazadas}</strong></span>
                      <span className="font-semibold text-slate-700">{prop.tasa_aceptacion}% de conversión</span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 rounded-l-full"
                        style={{ width: `${prop.tasa_aceptacion}%` }}
                      />
                      {prop.rechazadas > 0 && prop.total_enviadas > 0 && (
                        <div
                          className="h-full bg-red-400"
                          style={{ width: `${(prop.rechazadas / prop.total_enviadas) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <p className="text-xs text-emerald-600 mb-1">Ticket promedio ganado</p>
                      <p className="text-base font-bold text-emerald-800">
                        {prop.ticket_promedio_ganado !== null ? formatVal(prop.ticket_promedio_ganado) : '—'}
                      </p>
                    </div>
                    <div className={cn('rounded-lg p-3', ticketAlerta ? 'bg-red-50' : 'bg-slate-50')}>
                      <p className={cn('text-xs mb-1', ticketAlerta ? 'text-red-600' : 'text-slate-500')}>
                        Ticket promedio perdido {ticketAlerta && '⚠️'}
                      </p>
                      <p className={cn('text-base font-bold', ticketAlerta ? 'text-red-800' : 'text-slate-700')}>
                        {prop.ticket_promedio_perdido !== null ? formatVal(prop.ticket_promedio_perdido) : '—'}
                      </p>
                    </div>
                  </div>

                  {ticketAlerta && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                      ⚠️ El ticket promedio de propuestas <strong>perdidas</strong> es mayor al de las ganadas —
                      se están cerrando los negocios chicos y perdiendo los grandes.
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock size={12} />
                    <span>
                      Tiempo promedio hasta aceptación:{' '}
                      <strong className="text-slate-700">
                        {prop.tiempo_promedio_aceptacion !== null ? `${prop.tiempo_promedio_aceptacion} días` : '—'}
                      </strong>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Sección 5: Por país ──────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <SectionHeader icon={Globe} title="Leads por país" subtitle="Qué mercado convierte mejor, no solo cuál trae más volumen" />

        {isLoading ? (
          <Skeleton h="h-40" />
        ) : !d?.por_pais.length ? (
          <p className="text-sm text-slate-400 text-center py-8">Sin datos por país</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['País', 'Leads', 'Tasa cierre', 'Ciclo venta', 'Ticket prom. ARS', 'Ticket prom. USD', 'Valor total', 'Etapa pérdida'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-slate-500 pb-2 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {d.por_pais.map(row => (
                  <tr key={row.pais} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 pr-4 font-medium text-slate-800">{row.pais}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{row.cantidad}</td>
                    <td className="py-2.5 pr-4">
                      <span className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                        row.tasa_cierre >= 20 ? 'bg-green-100 text-green-700' :
                        row.tasa_cierre >= 10 ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      )}>
                        {row.tasa_cierre}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{row.ciclo_venta !== null ? `${row.ciclo_venta}d` : '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-600 text-xs">{row.ticket_promedio_ars !== null ? formatARS(row.ticket_promedio_ars) : '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-600 text-xs">{row.ticket_promedio_usd !== null ? formatUSD(row.ticket_promedio_usd) : '—'}</td>
                    <td className="py-2.5 pr-4 text-xs text-slate-600">
                      {row.valor_total_ars > 0 && <span className="block">{formatARS(row.valor_total_ars)}</span>}
                      {row.valor_total_usd > 0 && <span className="block">{formatUSD(row.valor_total_usd)}</span>}
                      {row.valor_total_ars === 0 && row.valor_total_usd === 0 && <span className="text-slate-400">—</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-500">{row.etapa_perdida_promedio ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Sección 6: Por fuente ────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <SectionHeader icon={TrendingUp} title="Leads por fuente" subtitle="El canal con más leads no es el mejor si su tasa de cierre es baja" />

        {isLoading ? (
          <Skeleton h="h-40" />
        ) : !d?.por_fuente.length ? (
          <p className="text-sm text-slate-400 text-center py-8">Sin datos por fuente</p>
        ) : (
          <div className="space-y-3">
            {d.por_fuente.map((row, idx) => {
              const maxCantidad = d.por_fuente[0]?.cantidad ?? 1
              const barPct = (row.cantidad / maxCantidad) * 100
              const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#22c55e', '#ec4899', '#ef4444', '#64748b']
              const color = COLORS[idx % COLORS.length]

              return (
                <div key={row.fuente} className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-600 w-28 flex-shrink-0 truncate">{row.label}</span>
                    <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                      <div
                        className="h-full rounded flex items-center px-2"
                        style={{ width: `${barPct}%`, backgroundColor: color }}
                      >
                        {barPct > 20 && (
                          <span className="text-white text-xs font-semibold">{row.cantidad}</span>
                        )}
                      </div>
                    </div>
                    {barPct <= 20 && (
                      <span className="text-xs font-semibold text-slate-700 w-5">{row.cantidad}</span>
                    )}
                    <div className="flex gap-3 flex-shrink-0 text-xs">
                      <span title="Tasa de cierre" className={cn(
                        'px-2 py-0.5 rounded font-medium',
                        row.tasa_cierre >= 20 ? 'bg-green-100 text-green-700' :
                        row.tasa_cierre >= 10 ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      )}>
                        {row.tasa_cierre}% cierre
                      </span>
                      <span title="Tasa a propuesta" className="text-slate-400">
                        {row.tasa_conversion_propuesta}% propuesta
                      </span>
                    </div>
                  </div>

                  <div className="ml-28 pl-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    {row.ciclo_venta !== null && <span>Ciclo: <strong>{row.ciclo_venta}d</strong></span>}
                    {row.ticket_promedio_ars !== null && <span>Ticket ARS: <strong>{formatARS(row.ticket_promedio_ars)}</strong></span>}
                    {row.ticket_promedio_usd !== null && <span>Ticket USD: <strong>{formatUSD(row.ticket_promedio_usd)}</strong></span>}
                    {(row.valor_total_ars > 0 || row.valor_total_usd > 0) && (
                      <span className="text-slate-600 font-medium">
                        Total: {row.valor_total_ars > 0 ? formatARS(row.valor_total_ars) : ''} {row.valor_total_usd > 0 ? formatUSD(row.valor_total_usd) : ''}
                      </span>
                    )}
                    {row.ganados > 0 && <span className="text-emerald-600">{row.ganados} ganados</span>}
                    {row.perdidos > 0 && <span className="text-red-500">{row.perdidos} perdidos</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Sección 7: Leads en riesgo ──────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <SectionHeader
          icon={AlertTriangle}
          title="Leads activos en riesgo"
          subtitle="Leads que llevan más días de lo normal en su etapa sin avanzar — sin filtro de período"
        />

        {isLoading ? (
          <Skeleton h="h-40" />
        ) : !d?.leads_en_riesgo.length ? (
          <div className="flex items-center gap-3 py-6 text-sm text-emerald-600">
            <Zap size={16} className="text-emerald-500" />
            Sin leads en riesgo actualmente — el pipeline está en movimiento
          </div>
        ) : (
          <div className="space-y-2">
            {/* Thresholds reminder */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { label: 'Sin contactar', dias: 3 },
                { label: 'Sin reunión', dias: 7 },
                { label: 'Sin propuesta', dias: 5 },
                { label: 'Propuesta sin respuesta', dias: 14 },
              ].map(t => (
                <span key={t.label} className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">
                  {t.label}: +{t.dias}d
                </span>
              ))}
            </div>

            {d.leads_en_riesgo.map(lead => {
              const stageConfig = PIPELINE_STAGE_MAP[lead.etapa as keyof typeof PIPELINE_STAGE_MAP]
              const diasExceso = lead.dias_en_etapa - lead.umbral
              const urgencia = diasExceso > 14 ? 'alta' : diasExceso > 7 ? 'media' : 'baja'

              return (
                <button
                  key={lead.id}
                  onClick={() => router.push(`/leads/${lead.id}`)}
                  className="w-full flex items-center gap-4 p-3 rounded-lg border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left group"
                >
                  <div className={cn(
                    'w-2 h-8 rounded-full flex-shrink-0',
                    urgencia === 'alta' ? 'bg-red-500' :
                    urgencia === 'media' ? 'bg-amber-400' : 'bg-yellow-300'
                  )} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">{lead.nombre}</span>
                      {lead.pais && <span className="text-xs text-slate-400">{lead.pais}</span>}
                      {lead.fuente && (
                        <span className="text-xs text-slate-400 hidden sm:inline">
                          · {FUENTES.find(f => f.value === lead.fuente)?.label ?? lead.fuente}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-xs px-2 py-0.5 rounded font-medium"
                        style={{ backgroundColor: stageConfig?.bgColor ?? '#f1f5f9', color: stageConfig?.color ?? '#64748b' }}
                      >
                        {stageConfig?.label ?? lead.etapa}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0 space-y-0.5">
                    <p className={cn(
                      'text-sm font-bold',
                      urgencia === 'alta' ? 'text-red-600' :
                      urgencia === 'media' ? 'text-amber-600' : 'text-yellow-600'
                    )}>
                      {lead.dias_en_etapa}d en etapa
                    </p>
                    <p className="text-xs text-slate-400">umbral: {lead.umbral}d</p>
                  </div>

                  <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </section>

    </div>
  )
}
