'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  TrendingUp, Users, DollarSign, AlertTriangle,
  Zap, Clock, Activity, Target,
  FileText, Phone, Mail, Calendar, CheckSquare, Globe,
  Plus, MessageSquare, ListTodo, FolderKanban,
} from 'lucide-react'
import { dashboardApi } from '@/lib/api'
import { formatUSD, formatARS } from '@/lib/utils'
import { PIPELINE_STAGE_MAP, PIPELINE_STAGES, FUENTES } from '@/types'
import type { PipelineStage } from '@/types'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { cn } from '@/lib/utils'
import { useLeadFormStore } from '@/hooks/useLeadFormStore'
import { LeadsBySourceChart } from '@/components/dashboard/charts/LeadsBySourceChart'
import { LeadsByCountryChart } from '@/components/dashboard/charts/LeadsByCountryChart'
import { TopOpportunitiesChart } from '@/components/dashboard/charts/TopOpportunitiesChart'
import { MonthlyEvolutionChart } from '@/components/dashboard/charts/MonthlyEvolutionChart'

function getDefaultFechaDesde(): string {
  const date = new Date()
  date.setMonth(date.getMonth() - 1)
  return date.toISOString().split('T')[0]
}

function getDefaultFechaHasta(): string {
  return new Date().toISOString().split('T')[0]
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  return `hace ${d}d`
}

const ACTIVITY_ICON: Record<string, React.ElementType> = {
  nota: FileText,
  llamada: Phone,
  email: Mail,
  reunion: Calendar,
  cambio_estado: Activity,
  tarea_completada: CheckSquare,
  webhook: Globe,
}

export default function DashboardPage() {
  const router = useRouter()
  const { open: openLeadForm } = useLeadFormStore()
  const [fechaDesde, setFechaDesde] = useState(getDefaultFechaDesde())
  const [fechaHasta, setFechaHasta] = useState(getDefaultFechaHasta())
  const [responsableId, setResponsableId] = useState('')

  const params = useMemo(() => {
    const p: Record<string, string> = {}
    if (fechaDesde) p.fecha_desde = fechaDesde
    if (fechaHasta) p.fecha_hasta = fechaHasta
    if (responsableId) p.responsable_id = responsableId
    return p
  }, [fechaDesde, fechaHasta, responsableId])

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', params],
    queryFn: () => dashboardApi.metrics(params),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const d = data

  const totalAlertas = (d?.alertas.sin_respuesta_24h ?? 0) +
    (d?.alertas.tareas_vencidas ?? 0) +
    (d?.alertas.leads_inactivos ?? 0) +
    (d?.alertas.leads_estancados ?? 0) +
    (d?.alertas.leads_calientes ?? 0)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500">Inteligencia comercial en tiempo real</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openLeadForm()}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              <span>Nuevo lead</span>
            </button>
            <button
              onClick={() => router.push('/leads/tareas')}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              title="Crear tarea"
            >
              <ListTodo size={16} />
              <span className="hidden sm:inline">Tareas</span>
            </button>
            <button
              onClick={() => router.push('/whatsapp')}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
              title="WhatsApp"
            >
              <MessageSquare size={16} />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>
          </div>
        </div>
        <DashboardFilters
          fechaDesde={fechaDesde}
          fechaHasta={fechaHasta}
          responsableId={responsableId}
          onFechaDesdeChange={setFechaDesde}
          onFechaHastaChange={setFechaHasta}
          onResponsableChange={setResponsableId}
        />
      </div>

      {/* Alertas */}
      {!isLoading && totalAlertas > 0 && (
        <div className="space-y-3">
          {(d?.alertas.sin_respuesta_24h ?? 0) > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  {d!.alertas.sin_respuesta_24h} lead{d!.alertas.sin_respuesta_24h !== 1 ? 's' : ''} sin respuesta +24h
                </p>
                <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1">
                  {d!.alertas.sin_respuesta_leads.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => router.push(`/leads/${l.id}`)}
                      className="text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded hover:bg-amber-200 transition-colors"
                    >
                      {l.nombre}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {(d?.alertas.leads_estancados ?? 0) > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <AlertTriangle size={16} className="text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-orange-800">
                  {d!.alertas.leads_estancados} lead{d!.alertas.leads_estancados !== 1 ? 's' : ''} estancado{d!.alertas.leads_estancados !== 1 ? 's' : ''} (+3d)
                </p>
                <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1">
                  {d!.alertas.leads_estancados_leads.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => router.push(`/leads/${l.id}`)}
                      className="text-xs bg-orange-100 text-orange-900 px-2 py-0.5 rounded hover:bg-orange-200 transition-colors"
                    >
                      {l.nombre}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {(d?.alertas.leads_calientes ?? 0) > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <Zap size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800">
                  {d!.alertas.leads_calientes} lead{d!.alertas.leads_calientes !== 1 ? 's' : ''} caliente{d!.alertas.leads_calientes !== 1 ? 's' : ''} (&lt;1h)
                </p>
                <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1">
                  {d!.alertas.leads_calientes_leads.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => router.push(`/leads/${l.id}`)}
                      className="text-xs bg-green-100 text-green-900 px-2 py-0.5 rounded hover:bg-green-200 transition-colors"
                    >
                      {l.nombre}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {(d?.alertas.tareas_vencidas ?? 0) > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-red-800">
                <strong>{d!.alertas.tareas_vencidas}</strong> tarea{d!.alertas.tareas_vencidas !== 1 ? 's' : ''} vencida{d!.alertas.tareas_vencidas !== 1 ? 's' : ''}
                <button onClick={() => router.push('/leads/tareas')} className="ml-2 text-xs bg-red-100 text-red-900 px-2 py-0.5 rounded hover:bg-red-200 transition-colors">
                  Ver tareas
                </button>
              </p>
            </div>
          )}
          {(d?.alertas.leads_inactivos ?? 0) > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <Clock size={16} className="text-slate-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {d!.alertas.leads_inactivos} lead{d!.alertas.leads_inactivos !== 1 ? 's' : ''} inactivo{d!.alertas.leads_inactivos !== 1 ? 's' : ''} (sin movimiento &gt;7d)
                </p>
                <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1">
                  {d!.alertas.leads_inactivos_leads.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => router.push(`/leads/${l.id}`)}
                      className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded hover:bg-slate-200 transition-colors"
                    >
                      {l.nombre}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white rounded-xl border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          <KpiCard
            icon={Users}
            label="Leads totales"
            value={d?.leads.total ?? 0}
            sub={`${d?.leads.nuevos_periodo ?? 0} nuevos este período`}
            color="blue"
            onClick={() => router.push('/leads')}
          />
          <KpiCard
            icon={Target}
            label="Tasa de conversión"
            value={`${d?.conversion.tasa ?? 0}%`}
            sub={`${d?.leads.por_etapa['cliente_ganado'] ?? 0} ganados`}
            color="green"
            onClick={() => router.push('/leads?estado=cliente_ganado')}
          />
          <KpiCard
            icon={DollarSign}
            label="Revenue ganado"
            value={`${formatUSD(d?.revenue.ganado_usd ?? 0)} / ${formatARS(d?.revenue.ganado_ars ?? 0)}`}
            sub={`Ticket prom. ${formatUSD(d?.revenue.ticket_promedio_usd ?? 0)}`}
            color="emerald"
            onClick={() => router.push('/leads?estado=cliente_ganado')}
          />
          <KpiCard
            icon={TrendingUp}
            label="Weighted pipeline"
            value={formatUSD(d?.revenue.proyectado_usd ?? 0)}
            sub="Probabilidad × valor"
            color="purple"
            onClick={() => router.push('/pipeline')}
          />
        </div>
      )}

      {/* Proyectos — only visible when there are won clients */}
      {!isLoading && (d?.proyectos?.en_tiempo ?? 0) + (d?.proyectos?.proximo_a_vencer ?? 0) + (d?.proyectos?.atrasado ?? 0) > 0 && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <FolderKanban size={15} className="text-slate-400" />
            Proyectos en curso
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-green-700">{d!.proyectos.en_tiempo}</p>
              <p className="text-xs text-green-600 mt-0.5">🟢 En tiempo</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-amber-700">{d!.proyectos.proximo_a_vencer}</p>
              <p className="text-xs text-amber-600 mt-0.5">🟡 Próximo a vencer</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-red-700">{d!.proyectos.atrasado}</p>
              <p className="text-xs text-red-600 mt-0.5">🔴 Atrasado</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {d!.proyectos.lista.map((p) => {
              const colorMap = {
                en_tiempo: 'text-green-700 bg-green-50 border-green-200',
                proximo_a_vencer: 'text-amber-700 bg-amber-50 border-amber-200',
                atrasado: 'text-red-700 bg-red-50 border-red-200',
              }
              const emoji = { en_tiempo: '🟢', proximo_a_vencer: '🟡', atrasado: '🔴' }[p.status]
              const daysLabel = p.dias_restantes < 0
                ? `${Math.abs(p.dias_restantes)}d de retraso`
                : p.dias_restantes === 0
                ? 'vence hoy'
                : `${p.dias_restantes}d restantes`
              const avance = p.avance_proyecto ?? 0
              const avanceColor = avance === 100 ? 'bg-green-500' : avance >= 70 ? 'bg-blue-500' : avance >= 30 ? 'bg-amber-500' : 'bg-slate-300'
              return (
                <button
                  key={p.id}
                  onClick={() => router.push(`/leads/${p.id}`)}
                  className="w-full px-3 py-2 rounded-lg border hover:bg-slate-50 transition-colors text-left space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-700 font-medium truncate">{p.nombre}{p.empresa ? ` · ${p.empresa}` : ''}</span>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded border flex-shrink-0 ml-2', colorMap[p.status])}>
                      {emoji} {daysLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', avanceColor)} style={{ width: `${avance}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-500 w-8 text-right">{avance}%</span>
                  </div>
                </button>
              )
            })}
          </div>
          {(d!.proyectos.sin_fecha ?? 0) > 0 && (
            <p className="text-xs text-slate-400">
              +{d!.proyectos.sin_fecha} cliente{d!.proyectos.sin_fecha !== 1 ? 's' : ''} ganado{d!.proyectos.sin_fecha !== 1 ? 's' : ''} sin fecha de proyecto asignada
            </p>
          )}
        </div>
      )}

      {/* Revenue Intelligence + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Revenue Intelligence */}
        <div className="bg-white rounded-xl border p-6 space-y-6">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <DollarSign size={15} className="text-slate-400" />
            Revenue Intelligence
          </h2>

          {/* Forecast */}
          <div>
            <p className="text-xs text-slate-500 mb-3">Forecast por horizonte</p>
            <div className="grid grid-cols-3 gap-3">
              {(['d7', 'd30', 'd90'] as const).map((horizon) => (
                <div key={horizon} className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">
                    {horizon === 'd7' ? '7 días' : horizon === 'd30' ? '30 días' : '90 días'}
                  </p>
                  <p className="text-base font-semibold text-slate-900">
                    {isLoading ? '—' : formatUSD(d?.revenue.forecast[horizon] ?? 0)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline value por etapa */}
          <div>
            <p className="text-xs text-slate-500 mb-3">Pipeline value por etapa (USD / ARS)</p>
            <div className="space-y-2">
              {PIPELINE_STAGES.filter(s => s.zone !== 'cierre' || s.value === 'cliente_ganado').map(({ value }) => {
                const valUsd = d?.revenue.pipeline_value_usd?.[value] ?? 0
                const valArs = d?.revenue.pipeline_value_ars?.[value] ?? 0
                const maxVal = Math.max(...PIPELINE_STAGES.map(s => (d?.revenue.pipeline_value_usd?.[s.value] ?? 0) + (d?.revenue.pipeline_value_ars?.[s.value] ?? 0)), 1)
                const pct = Math.round(((valUsd + valArs) / maxVal) * 100)
                const config = PIPELINE_STAGE_MAP[value]
                if (!isLoading && valUsd === 0 && valArs === 0) return null
                return (
                  <div
                    key={value}
                    className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded px-1 py-1 -mx-1 -my-1 transition-colors"
                    onClick={() => router.push(`/leads?view=kanban&estado_pipeline=${value}`)}
                  >
                    <span className="text-xs text-slate-500 w-32 flex-shrink-0 truncate">{config.label}</span>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: isLoading ? '0%' : `${pct}%`, backgroundColor: config.color }}
                      />
                    </div>
                    <span className="text-xs font-medium text-slate-700 w-28 text-right">
                      {isLoading ? '—' : `${formatUSD(valUsd)} / ${formatARS(valArs)}`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Pipeline funnel */}
        <div className="bg-white rounded-xl border p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Activity size={15} className="text-slate-400" />
              Pipeline por etapa
            </h2>
            {d?.conversion.bottleneck && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                Cuello de botella: {PIPELINE_STAGE_MAP[d.conversion.bottleneck].label}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {PIPELINE_STAGES.map(({ value }, idx) => {
              const count = d?.leads.por_etapa[value] ?? 0
              const total = d?.leads.total ?? 1
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              const config = PIPELINE_STAGE_MAP[value]
              const isBottleneck = d?.conversion.bottleneck === value

              // Calcular tasa de conversión desde etapa anterior
              let conversionRate: number | null = null
              if (idx > 0) {
                const prevStage = PIPELINE_STAGES[idx - 1].value
                const prevCount = d?.leads.por_etapa[prevStage] ?? 0
                if (prevCount > 0) {
                  conversionRate = Math.round((count / prevCount) * 100)
                }
              }

              return (
                <div
                  key={value}
                  className={cn(
                    'flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded px-1 py-1 -mx-1 -my-1 transition-colors',
                    isBottleneck && 'bg-amber-50'
                  )}
                  onClick={() => router.push(`/leads?view=kanban&estado_pipeline=${value}`)}
                >
                  <span className="text-xs text-slate-500 w-36 flex-shrink-0 truncate">{config.label}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', isBottleneck && 'bg-amber-400')}
                      style={{ width: isLoading ? '0%' : `${pct}%`, backgroundColor: isBottleneck ? undefined : config.color }}
                    />
                  </div>
                  <div className="flex items-center gap-2 w-16 text-right">
                    <span className="text-xs font-medium text-slate-700">
                      {isLoading ? '—' : count}
                    </span>
                    {conversionRate !== null && (
                      <span className={cn('text-xs', conversionRate < 50 ? 'text-red-500' : conversionRate < 70 ? 'text-amber-500' : 'text-green-500')}>
                        {conversionRate}%
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Top responsables + Live feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top responsables */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <Users size={15} className="text-slate-400" />
            Performance por usuario
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />)}
            </div>
          ) : (d?.top_responsables ?? []).length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Sin usuarios de ventas</p>
          ) : (
            <div className="space-y-1">
              {(d?.top_responsables ?? []).map((u, idx) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/leads?view=kanban&responsable_id=${u.id}`)}
                >
                  <span className="text-xs text-slate-400 w-4 text-right">{idx + 1}</span>
                  <UserAvatar user={u} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{u.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-400 rounded-full"
                          style={{ width: `${u.tasa_conversion}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{u.tasa_conversion}%</span>
                    </div>
                  </div>
                  <div className="flex gap-4 text-right flex-shrink-0">
                    <div>
                      <p className="text-xs text-slate-400">Activos</p>
                      <p className="text-sm font-semibold text-slate-900">{u.activos}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Ganados</p>
                      <p className="text-sm font-semibold text-emerald-600">{u.ganados}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Revenue</p>
                      <p className="text-xs font-semibold text-slate-900">
                        {u.revenue_usd > 0 ? formatUSD(u.revenue_usd) : ''} {u.revenue_ars > 0 ? formatARS(u.revenue_ars) : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Actividad</p>
                      <p className="text-sm font-semibold text-slate-900">{u.actividades}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live feed */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <Zap size={15} className="text-slate-400" />
            Live feed
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {/* Últimos leads */}
              {(d?.ultimos_leads ?? []).slice(0, 4).map((lead) => {
                const stageConfig = PIPELINE_STAGE_MAP[lead.estado_pipeline]
                return (
                  <div
                    key={`lead-${lead.id}`}
                    className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                    onClick={() => { if (lead.id) router.push(`/leads/${lead.id}`) }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: stageConfig?.bgColor ?? '#f1f5f9' }}
                    >
                      <Users size={11} style={{ color: stageConfig?.color ?? '#64748b' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">
                        <span className="font-medium">{lead.nombre}</span>
                        <span className="text-slate-400"> · nuevo lead</span>
                      </p>
                      <p className="text-xs text-slate-400">{lead.fuente ? (FUENTES.find((f) => f.value === lead.fuente)?.label ?? lead.fuente) : '—'} · {timeAgo(lead.created_at)}</p>
                    </div>
                  </div>
                )
              })}

              {/* Actividades */}
              {(d?.actividad_reciente ?? []).map((act) => {
                const Icon = ACTIVITY_ICON[act.tipo] ?? Activity
                return (
                  <div
                    key={`act-${act.id}`}
                    className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                    onClick={() => { if (act.lead_id) router.push(`/leads/${act.lead_id}`) }}
                  >
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon size={11} className="text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 truncate">
                        {act.lead_nombre && (
                          <span className="font-medium">{act.lead_nombre} · </span>
                        )}
                        <span className="text-slate-600">{act.descripcion}</span>
                      </p>
                      <p className="text-xs text-slate-400">
                        {act.user_full_name ?? 'Sistema'} · {timeAgo(act.created_at)}
                      </p>
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

      {/* Leads por fuente */}
      <LeadsBySourceChart 
        data={d?.leads.por_fuente || {}} 
        isLoading={isLoading} 
      />

      {/* Leads por país */}
      <LeadsByCountryChart 
        data={d?.leads.por_pais || {}} 
        isLoading={isLoading} 
      />

      {/* Top oportunidades */}
      <TopOpportunitiesChart
        data={d?.top_oportunidades || []}
        isLoading={isLoading}
      />

      {/* Evolución mensual */}
      <MonthlyEvolutionChart
        responsableId={responsableId}
        months={6}
      />
    </div>
  )
}

function KpiCard({
  icon: Icon, label, value, sub, color, onClick,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub: string
  color: 'blue' | 'green' | 'emerald' | 'purple' | 'orange'
  onClick?: () => void
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-violet-50 text-violet-600',
    orange: 'bg-orange-50 text-orange-600',
  }
  return (
    <div
      className={`bg-white rounded-xl border p-4 space-y-3 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', colors[color])}>
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-semibold text-slate-900">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}
