'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Users, DollarSign, Target, Clock, BarChart3, Globe,
  TrendingUp, AlertTriangle, Zap, Activity, ArrowRight,
  ArrowDown, ChevronRight, FileText, Phone, Mail, Calendar,
  CheckSquare, FolderKanban, Plus, MessageSquare, ListTodo,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatUSD, formatARS } from '@/lib/utils'
import { FUENTES, PAISES, PIPELINE_STAGE_MAP } from '@/types'
import type { PipelineStage } from '@/types'
import { dashboardApi } from '@/lib/api'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { useLeadFormStore } from '@/hooks/useLeadFormStore'
import { MonthlyEvolutionChart } from '@/components/dashboard/charts/MonthlyEvolutionChart'

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDefaultDesde() {
  return new Date(Date.now() - 30 * 86_400_000).toISOString().split('T')[0]
}
function getDefaultHasta() {
  return new Date().toISOString().split('T')[0]
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

const ACTIVITY_ICON: Record<string, React.ElementType> = {
  nota: FileText, llamada: Phone, email: Mail, reunion: Calendar,
  cambio_estado: Activity, tarea_completada: CheckSquare, webhook: Globe,
}

const PRESETS: { label: string; key: string }[] = [
  { label: '7 días', key: '7d' },
  { label: '30 días', key: '30d' },
  { label: '90 días', key: '90d' },
  { label: 'Este mes', key: 'mes' },
  { label: 'Este trimestre', key: 'trimestre' },
  { label: 'Este año', key: 'año' },
]

function applyPreset(key: string): [string, string] {
  const today = new Date()
  const t = today.toISOString().split('T')[0]
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0]
  if (key === '7d') return [ago(7), t]
  if (key === '30d') return [ago(30), t]
  if (key === '90d') return [ago(90), t]
  if (key === 'mes') return [new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0], t]
  if (key === 'trimestre') return [new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1).toISOString().split('T')[0], t]
  if (key === 'año') return [new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0], t]
  return [getDefaultDesde(), t]
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

function StatCard({ label, value, sub, color = 'slate', large = false }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode
  color?: 'slate' | 'green' | 'blue' | 'amber' | 'red' | 'purple'; large?: boolean
}) {
  const bg = { slate: 'bg-white border-slate-200', green: 'bg-emerald-50 border-emerald-200', blue: 'bg-blue-50 border-blue-200', amber: 'bg-amber-50 border-amber-200', red: 'bg-red-50 border-red-200', purple: 'bg-violet-50 border-violet-200' }
  const tx = { slate: 'text-slate-900', green: 'text-emerald-800', blue: 'text-blue-800', amber: 'text-amber-800', red: 'text-red-800', purple: 'text-violet-800' }
  return (
    <div className={cn('rounded-xl border p-4 space-y-1', bg[color])}>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={cn('font-bold leading-tight', large ? 'text-2xl' : 'text-xl', tx[color])}>{value}</p>
      {sub && <p className="text-xs text-slate-500 pt-0.5">{sub}</p>}
    </div>
  )
}

function Skel({ h = 'h-24' }: { h?: string }) {
  return <div className={cn('rounded-xl bg-slate-100 animate-pulse w-full', h)} />
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const { open: openLeadForm } = useLeadFormStore()

  const [fechaDesde, setFechaDesde] = useState(getDefaultDesde)
  const [fechaHasta, setFechaHasta] = useState(getDefaultHasta)
  const [pais, setPais] = useState('')
  const [fuente, setFuente] = useState('')
  const [responsableId, setResponsableId] = useState('')

  const analyticsParams = useMemo(() => {
    const p: Record<string, string> = { fecha_desde: fechaDesde, fecha_hasta: fechaHasta }
    if (pais) p.pais = pais
    if (fuente) p.fuente = fuente
    return p
  }, [fechaDesde, fechaHasta, pais, fuente])

  const dashParams = useMemo(() => {
    const p: Record<string, string> = { fecha_desde: fechaDesde, fecha_hasta: fechaHasta }
    if (responsableId) p.responsable_id = responsableId
    return p
  }, [fechaDesde, fechaHasta, responsableId])

  const { data: analytics, isLoading: loadingAnalytics } = useQuery<AnalyticsData>({
    queryKey: ['analytics', analyticsParams],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?${new URLSearchParams(analyticsParams)}`)
      if (!res.ok) throw new Error('Error')
      return res.json()
    },
    staleTime: 60_000,
  })

  const { data: dash, isLoading: loadingDash } = useQuery({
    queryKey: ['dashboard', dashParams],
    queryFn: () => dashboardApi.metrics(dashParams),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const a = analytics
  const d = dash

  return (
    <div className="space-y-8 pb-16">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Visión comercial completa del período</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openLeadForm()} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={16} /><span>Nuevo lead</span>
          </button>
          <button onClick={() => router.push('/leads/tareas')} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
            <ListTodo size={16} /><span className="hidden sm:inline">Tareas</span>
          </button>
          <button onClick={() => router.push('/whatsapp')} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors">
            <MessageSquare size={16} /><span className="hidden sm:inline">WhatsApp</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(({ label, key }) => (
            <button
              key={key}
              onClick={() => { const [d, h] = applyPreset(key); setFechaDesde(d); setFechaHasta(h) }}
              className="text-xs px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Desde</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Hasta</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">País</label>
            <select value={pais} onChange={e => setPais(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Todos los países</option>
              {PAISES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Fuente</label>
            <select value={fuente} onChange={e => setFuente(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Todas las fuentes</option>
              {FUENTES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Responsable</label>
            <select value={responsableId} onChange={e => setResponsableId(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Todos</option>
              {(d?.top_responsables ?? []).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── S1: Resumen ejecutivo ──────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <SectionHeader icon={Target} title="Resumen ejecutivo" subtitle="Métricas clave del período seleccionado" />
        {loadingAnalytics ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <Skel key={i} />)}</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Leads ingresados" value={a?.resumen.total_leads ?? 0} sub={`${a?.resumen.cierres_ganados ?? 0} cerrados ganados`} color="blue" large />
              <StatCard
                label="Tasa de cierre ganado"
                value={`${a?.resumen.tasa_cierre_ganado ?? 0}%`}
                sub="Leads ganados / leads ingresados"
                color={(a?.resumen.tasa_cierre_ganado ?? 0) >= 20 ? 'green' : (a?.resumen.tasa_cierre_ganado ?? 0) >= 10 ? 'amber' : 'red'}
                large
              />
              <StatCard
                label="Conversión de propuesta"
                value={`${a?.resumen.tasa_conversion_propuesta ?? 0}%`}
                sub={`${a?.resumen.propuestas_aceptadas_count ?? 0} / ${a?.resumen.propuestas_count ?? 0} propuestas`}
                color={(a?.resumen.tasa_conversion_propuesta ?? 0) >= 50 ? 'green' : (a?.resumen.tasa_conversion_propuesta ?? 0) >= 30 ? 'amber' : 'slate'}
                large
              />
              <StatCard label="Ciclo de venta promedio" value={a?.resumen.ciclo_venta_promedio != null ? `${a.resumen.ciclo_venta_promedio}d` : '—'} sub="Ingreso → cierre ganado" color="purple" large />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StatCard label="Tiempo: ingreso → propuesta aceptada" value={a?.resumen.tiempo_ingreso_propuesta_aceptada != null ? `${a.resumen.tiempo_ingreso_propuesta_aceptada} días` : '—'} sub="Duración total del proceso comercial completo" />
              <StatCard label="Tiempo: propuesta enviada → aceptada" value={a?.resumen.tiempo_propuesta_aceptacion != null ? `${a.resumen.tiempo_propuesta_aceptacion} días` : '—'} sub="Cuánto tarda el cliente en decidir tras recibir la propuesta" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Propuestas enviadas ARS" value={formatARS(a?.resumen.propuestas_enviadas_ars ?? 0)} sub="Total en período" />
              <StatCard label="Propuestas enviadas USD" value={formatUSD(a?.resumen.propuestas_enviadas_usd ?? 0)} sub="Total en período" />
              <StatCard label="Propuestas ganadas ARS" value={formatARS(a?.resumen.propuestas_ganadas_ars ?? 0)} sub="Solo aceptadas" color={(a?.resumen.propuestas_ganadas_ars ?? 0) > 0 ? 'green' : 'slate'} />
              <StatCard label="Propuestas ganadas USD" value={formatUSD(a?.resumen.propuestas_ganadas_usd ?? 0)} sub="Solo aceptadas" color={(a?.resumen.propuestas_ganadas_usd ?? 0) > 0 ? 'green' : 'slate'} />
            </div>
          </div>
        )}
      </section>

      {/* ── S2: Embudo ────────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <SectionHeader icon={BarChart3} title="Embudo de conversión" subtitle="Cuántos leads pasan de una etapa a la siguiente" />
        {loadingAnalytics ? <Skel h="h-48" /> : !a?.funnel.length ? (
          <p className="text-sm text-slate-400 text-center py-8">Sin datos para el período</p>
        ) : (
          <div className="space-y-3">
            {a.funnel.map((stage, idx) => {
              const maxCount = a.funnel[0]?.cantidad ?? 1
              const barPct = maxCount > 0 ? (stage.cantidad / maxCount) * 100 : 0
              const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#0ea5e9', '#22c55e']
              return (
                <div key={stage.key} className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-slate-600 w-36 flex-shrink-0">{stage.label}</span>
                    <div className="flex-1 h-7 bg-slate-100 rounded-md overflow-hidden relative">
                      <div className="h-full rounded-md flex items-center px-3 transition-all duration-700" style={{ width: `${barPct}%`, backgroundColor: colors[idx] }}>
                        {barPct > 15 && <span className="text-white text-xs font-semibold">{stage.cantidad}</span>}
                      </div>
                      {barPct <= 15 && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-700 text-xs font-semibold">{stage.cantidad}</span>}
                    </div>
                    <div className="flex gap-3 items-center flex-shrink-0 w-40 text-right justify-end">
                      {stage.tasa_vs_anterior !== null && (
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded', stage.tasa_vs_anterior >= 70 ? 'bg-green-100 text-green-700' : stage.tasa_vs_anterior >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
                          {stage.tasa_vs_anterior}%
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{stage.tasa_acumulada}% total</span>
                    </div>
                  </div>
                  {stage.perdidos > 0 && (
                    <div className="ml-36 flex items-center gap-1.5">
                      <ArrowDown size={10} className="text-red-400" />
                      <span className="text-xs text-red-500">{stage.perdidos} perdido{stage.perdidos !== 1 ? 's' : ''} en esta etapa</span>
                    </div>
                  )}
                  {idx < a.funnel.length - 1 && (
                    <div className="ml-36 pl-1"><ChevronRight size={12} className="text-slate-300 rotate-90" /></div>
                  )}
                </div>
              )
            })}
            {a.funnel.reduce((s, st) => s + st.perdidos, 0) > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">Leads perdidos por etapa</p>
                <div className="flex flex-wrap gap-2">
                  {a.funnel.filter(s => s.perdidos > 0).map(s => (
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

      {/* ── S3: Tiempos ───────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <SectionHeader icon={Clock} title="Tiempos entre etapas" subtitle="Días promedio para avanzar de una etapa a la siguiente" />
        {loadingAnalytics ? <Skel h="h-36" /> : (
          <div className="space-y-3">
            {[
              { from: 'Ingreso', to: 'Primer contacto', value: a?.tiempos.ingreso_contacto ?? null, insight: 'Velocidad de respuesta del equipo', alert: (v: number) => v > 1 },
              { from: 'Contacto', to: 'Reunión', value: a?.tiempos.contacto_reunion ?? null, insight: 'Eficacia del seguimiento post-contacto', alert: (v: number) => v > 7 },
              { from: 'Reunión', to: 'Propuesta enviada', value: a?.tiempos.reunion_propuesta ?? null, insight: 'Tiempo de preparación interna', alert: (v: number) => v > 5 },
              { from: 'Propuesta enviada', to: 'Cierre ganado', value: a?.tiempos.propuesta_cierre_ganado ?? null, insight: 'Tiempo de decisión del cliente (ganado)', alert: (v: number) => v > 14 },
              { from: 'Propuesta enviada', to: 'Cierre perdido', value: a?.tiempos.propuesta_cierre_perdido ?? null, insight: 'Tiempo de decisión del cliente (perdido)', alert: (_: number) => false, muted: true },
            ].map((row, i) => {
              const isAlert = row.value !== null && row.alert(row.value)
              return (
                <div key={i} className={cn('flex items-center gap-4 p-3 rounded-lg', isAlert ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50')}>
                  <div className="flex items-center gap-2 text-xs text-slate-600 w-52 flex-shrink-0">
                    <span className={cn('font-medium', row.muted && 'text-slate-400')}>{row.from}</span>
                    <ArrowRight size={11} className="text-slate-400" />
                    <span className={cn('font-medium', row.muted && 'text-slate-400')}>{row.to}</span>
                  </div>
                  <div className={cn('text-xl font-bold w-20 flex-shrink-0', isAlert ? 'text-amber-700' : row.value !== null ? 'text-slate-800' : 'text-slate-300')}>
                    {row.value !== null ? `${row.value}d` : '—'}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-500">{row.insight}</p>
                    {isAlert && <p className="text-xs text-amber-600 mt-0.5 font-medium">⚠️ Por encima del umbral recomendado</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── S4: Propuestas ────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <SectionHeader icon={DollarSign} title="Análisis de propuestas" subtitle="ARS y USD no se mezclan ni convierten" />
        {loadingAnalytics ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Skel h="h-48" /><Skel h="h-48" /></div>
        ) : !a?.propuestas.length ? (
          <p className="text-sm text-slate-400 text-center py-8">Sin propuestas en el período</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {a.propuestas.map(prop => {
              const fmt = prop.moneda === 'ARS' ? formatARS : formatUSD
              const ticketAlerta = prop.ticket_promedio_perdido != null && prop.ticket_promedio_ganado != null && prop.ticket_promedio_perdido > prop.ticket_promedio_ganado
              return (
                <div key={prop.moneda} className="border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">Moneda: {prop.moneda}</span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">{prop.total_enviadas} propuesta{prop.total_enviadas !== 1 ? 's' : ''}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                      <span>Aceptadas: <strong className="text-emerald-600">{prop.aceptadas}</strong></span>
                      <span>Rechazadas: <strong className="text-red-500">{prop.rechazadas}</strong></span>
                      <span className="font-semibold text-slate-700">{prop.tasa_aceptacion}% conversión</span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                      <div className="h-full bg-emerald-500 rounded-l-full" style={{ width: `${prop.tasa_aceptacion}%` }} />
                      {prop.rechazadas > 0 && prop.total_enviadas > 0 && (
                        <div className="h-full bg-red-400" style={{ width: `${(prop.rechazadas / prop.total_enviadas) * 100}%` }} />
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <p className="text-xs text-emerald-600 mb-1">Ticket promedio ganado</p>
                      <p className="text-base font-bold text-emerald-800">{prop.ticket_promedio_ganado != null ? fmt(prop.ticket_promedio_ganado) : '—'}</p>
                    </div>
                    <div className={cn('rounded-lg p-3', ticketAlerta ? 'bg-red-50' : 'bg-slate-50')}>
                      <p className={cn('text-xs mb-1', ticketAlerta ? 'text-red-600' : 'text-slate-500')}>Ticket promedio perdido {ticketAlerta && '⚠️'}</p>
                      <p className={cn('text-base font-bold', ticketAlerta ? 'text-red-800' : 'text-slate-700')}>{prop.ticket_promedio_perdido != null ? fmt(prop.ticket_promedio_perdido) : '—'}</p>
                    </div>
                  </div>
                  {ticketAlerta && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                      ⚠️ El ticket promedio perdido es mayor al ganado — se cierran los negocios chicos y se pierden los grandes.
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock size={12} />
                    <span>Tiempo promedio hasta aceptación: <strong className="text-slate-700">{prop.tiempo_promedio_aceptacion != null ? `${prop.tiempo_promedio_aceptacion} días` : '—'}</strong></span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── S5 + S6: País y Fuente en grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* País */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <SectionHeader icon={Globe} title="Por país" subtitle="Qué mercado convierte mejor" />
          {loadingAnalytics ? <Skel h="h-40" /> : !a?.por_pais.length ? (
            <p className="text-sm text-slate-400 text-center py-6">Sin datos</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['País', 'Leads', 'Cierre', 'Ciclo', 'Valor total'].map(h => (
                      <th key={h} className="text-left text-xs font-medium text-slate-500 pb-2 pr-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {a.por_pais.map(row => (
                    <tr key={row.pais} className="hover:bg-slate-50">
                      <td className="py-2 pr-3 font-medium text-slate-800 text-xs">{row.pais}</td>
                      <td className="py-2 pr-3 text-slate-600 text-xs">{row.cantidad}</td>
                      <td className="py-2 pr-3">
                        <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', row.tasa_cierre >= 20 ? 'bg-green-100 text-green-700' : row.tasa_cierre >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
                          {row.tasa_cierre}%
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-slate-500 text-xs">{row.ciclo_venta != null ? `${row.ciclo_venta}d` : '—'}</td>
                      <td className="py-2 text-xs text-slate-600">
                        {row.valor_total_ars > 0 && <span className="block">{formatARS(row.valor_total_ars)}</span>}
                        {row.valor_total_usd > 0 && <span className="block">{formatUSD(row.valor_total_usd)}</span>}
                        {row.valor_total_ars === 0 && row.valor_total_usd === 0 && <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Fuente */}
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <SectionHeader icon={TrendingUp} title="Por fuente" subtitle="El canal con más leads no es el mejor si el cierre es bajo" />
          {loadingAnalytics ? <Skel h="h-40" /> : !a?.por_fuente.length ? (
            <p className="text-sm text-slate-400 text-center py-6">Sin datos</p>
          ) : (
            <div className="space-y-3">
              {a.por_fuente.map((row, idx) => {
                const maxC = a.por_fuente[0]?.cantidad ?? 1
                const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#22c55e', '#ec4899', '#ef4444', '#64748b']
                return (
                  <div key={row.fuente}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-600 w-24 flex-shrink-0 truncate">{row.label}</span>
                      <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                        <div className="h-full rounded flex items-center px-2" style={{ width: `${(row.cantidad / maxC) * 100}%`, backgroundColor: COLORS[idx % COLORS.length] }}>
                          {(row.cantidad / maxC) * 100 > 20 && <span className="text-white text-xs font-semibold">{row.cantidad}</span>}
                        </div>
                      </div>
                      {(row.cantidad / maxC) * 100 <= 20 && <span className="text-xs font-semibold text-slate-700 w-4">{row.cantidad}</span>}
                      <span className={cn('text-xs px-2 py-0.5 rounded font-medium flex-shrink-0', row.tasa_cierre >= 20 ? 'bg-green-100 text-green-700' : row.tasa_cierre >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500')}>
                        {row.tasa_cierre}%
                      </span>
                    </div>
                    <div className="ml-24 pl-2 flex flex-wrap gap-2 text-xs text-slate-400 mt-0.5">
                      {row.ciclo_venta != null && <span>Ciclo: <strong className="text-slate-600">{row.ciclo_venta}d</strong></span>}
                      {row.valor_total_ars > 0 && <span>{formatARS(row.valor_total_ars)}</span>}
                      {row.valor_total_usd > 0 && <span>{formatUSD(row.valor_total_usd)}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── S7: Leads en riesgo ───────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <SectionHeader icon={AlertTriangle} title="Leads activos en riesgo" subtitle="Sin filtro de período — leads estancados más allá del umbral" />
        {loadingAnalytics ? <Skel h="h-32" /> : !a?.leads_en_riesgo.length ? (
          <div className="flex items-center gap-3 py-4 text-sm text-emerald-600">
            <Zap size={16} className="text-emerald-500" />
            Sin leads en riesgo actualmente
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 mb-3">
              {[{ l: 'Sin contactar', d: 3 }, { l: 'Sin reunión', d: 7 }, { l: 'Sin propuesta', d: 5 }, { l: 'Propuesta sin respuesta', d: 14 }].map(t => (
                <span key={t.l} className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">{t.l}: +{t.d}d</span>
              ))}
            </div>
            {a.leads_en_riesgo.map(lead => {
              const stageConfig = PIPELINE_STAGE_MAP[lead.etapa as PipelineStage]
              const exceso = lead.dias_en_etapa - lead.umbral
              const urg = exceso > 14 ? 'alta' : exceso > 7 ? 'media' : 'baja'
              return (
                <button key={lead.id} onClick={() => router.push(`/leads/${lead.id}`)}
                  className="w-full flex items-center gap-4 p-3 rounded-lg border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left group"
                >
                  <div className={cn('w-2 h-8 rounded-full flex-shrink-0', urg === 'alta' ? 'bg-red-500' : urg === 'media' ? 'bg-amber-400' : 'bg-yellow-300')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">{lead.nombre}</span>
                      {lead.pais && <span className="text-xs text-slate-400">{lead.pais}</span>}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded font-medium mt-0.5 inline-block"
                      style={{ backgroundColor: stageConfig?.bgColor ?? '#f1f5f9', color: stageConfig?.color ?? '#64748b' }}>
                      {stageConfig?.label ?? lead.etapa}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={cn('text-sm font-bold', urg === 'alta' ? 'text-red-600' : urg === 'media' ? 'text-amber-600' : 'text-yellow-600')}>{lead.dias_en_etapa}d</p>
                    <p className="text-xs text-slate-400">umbral {lead.umbral}d</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Operacional: Performance + Live feed ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <Users size={15} className="text-slate-400" />
            Performance por usuario
          </h2>
          {loadingDash ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />)}</div>
          ) : (d?.top_responsables ?? []).length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Sin usuarios de ventas</p>
          ) : (
            <div className="space-y-1">
              {(d?.top_responsables ?? []).map((u, idx) => (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer" onClick={() => router.push(`/leads?view=kanban&responsable_id=${u.id}`)}>
                  <span className="text-xs text-slate-400 w-4 text-right">{idx + 1}</span>
                  <UserAvatar user={u} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{u.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${u.tasa_conversion}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{u.tasa_conversion}%</span>
                    </div>
                  </div>
                  <div className="flex gap-4 text-right flex-shrink-0">
                    <div><p className="text-xs text-slate-400">Activos</p><p className="text-sm font-semibold text-slate-900">{u.activos}</p></div>
                    <div><p className="text-xs text-slate-400">Ganados</p><p className="text-sm font-semibold text-emerald-600">{u.ganados}</p></div>
                    <div><p className="text-xs text-slate-400">Revenue</p><p className="text-xs font-semibold text-slate-900">{u.revenue_usd > 0 ? formatUSD(u.revenue_usd) : ''} {u.revenue_ars > 0 ? formatARS(u.revenue_ars) : ''}</p></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <Zap size={15} className="text-slate-400" />
            Live feed
          </h2>
          {loadingDash ? (
            <div className="space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />)}</div>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {(d?.ultimos_leads ?? []).slice(0, 4).map(lead => {
                const sc = PIPELINE_STAGE_MAP[lead.estado_pipeline as PipelineStage]
                return (
                  <div key={`lead-${lead.id}`} className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer" onClick={() => router.push(`/leads/${lead.id}`)}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: sc?.bgColor ?? '#f1f5f9' }}>
                      <Users size={11} style={{ color: sc?.color ?? '#64748b' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate"><span className="font-medium">{lead.nombre}</span><span className="text-slate-400"> · nuevo lead</span></p>
                      <p className="text-xs text-slate-400">{lead.fuente ? (FUENTES.find(f => f.value === lead.fuente)?.label ?? lead.fuente) : '—'} · {timeAgo(lead.created_at)}</p>
                    </div>
                  </div>
                )
              })}
              {(d?.actividad_reciente ?? []).map(act => {
                const Icon = ACTIVITY_ICON[act.tipo] ?? Activity
                return (
                  <div key={`act-${act.id}`} className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer" onClick={() => { if (act.lead_id) router.push(`/leads/${act.lead_id}`) }}>
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5"><Icon size={11} className="text-slate-500" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">{act.lead_nombre && <span className="font-medium">{act.lead_nombre} · </span>}<span className="text-slate-600">{act.descripcion}</span></p>
                      <p className="text-xs text-slate-400">{act.user_full_name ?? 'Sistema'} · {timeAgo(act.created_at)}</p>
                    </div>
                  </div>
                )
              })}
              {(d?.ultimos_leads ?? []).length === 0 && (d?.actividad_reciente ?? []).length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">Sin actividad reciente</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Proyectos */}
      {!loadingDash && (d?.proyectos?.en_tiempo ?? 0) + (d?.proyectos?.proximo_a_vencer ?? 0) + (d?.proyectos?.atrasado ?? 0) > 0 && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <FolderKanban size={15} className="text-slate-400" />Proyectos en curso
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center"><p className="text-xl font-bold text-green-700">{d!.proyectos.en_tiempo}</p><p className="text-xs text-green-600 mt-0.5">🟢 En tiempo</p></div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center"><p className="text-xl font-bold text-amber-700">{d!.proyectos.proximo_a_vencer}</p><p className="text-xs text-amber-600 mt-0.5">🟡 Próximo a vencer</p></div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center"><p className="text-xl font-bold text-red-700">{d!.proyectos.atrasado}</p><p className="text-xs text-red-600 mt-0.5">🔴 Atrasado</p></div>
          </div>
          <div className="space-y-1.5">
            {d!.proyectos.lista.map(p => {
              const colorMap = { en_tiempo: 'text-green-700 bg-green-50 border-green-200', proximo_a_vencer: 'text-amber-700 bg-amber-50 border-amber-200', atrasado: 'text-red-700 bg-red-50 border-red-200' }
              const emoji = { en_tiempo: '🟢', proximo_a_vencer: '🟡', atrasado: '🔴' }[p.status]
              const daysLabel = p.dias_restantes < 0 ? `${Math.abs(p.dias_restantes)}d de retraso` : p.dias_restantes === 0 ? 'vence hoy' : `${p.dias_restantes}d restantes`
              const avance = p.avance_proyecto ?? 0
              const avanceColor = avance === 100 ? 'bg-green-500' : avance >= 70 ? 'bg-blue-500' : avance >= 30 ? 'bg-amber-500' : 'bg-slate-300'
              return (
                <button key={p.id} onClick={() => router.push(`/leads/${p.id}`)} className="w-full px-3 py-2 rounded-lg border hover:bg-slate-50 transition-colors text-left space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700 font-medium truncate">{p.nombre}{p.empresa ? ` · ${p.empresa}` : ''}</span>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded border flex-shrink-0 ml-2', colorMap[p.status])}>{emoji} {daysLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className={cn('h-full rounded-full', avanceColor)} style={{ width: `${avance}%` }} /></div>
                    <span className="text-[10px] text-slate-500 w-8 text-right">{avance}%</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Evolución mensual */}
      <MonthlyEvolutionChart responsableId={responsableId} months={6} />

    </div>
  )
}
