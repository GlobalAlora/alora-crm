'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  TrendingUp, Users, DollarSign, AlertTriangle,
  Zap, Clock, Activity, Target,
  FileText, Phone, Mail, Calendar, CheckSquare, Globe,
} from 'lucide-react'
import { dashboardApi } from '@/lib/api'
import { formatUSD, formatARS } from '@/lib/utils'
import { PIPELINE_STAGE_MAP, PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'
import { DashboardFilters } from '@/components/dashboard/DashboardFilters'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { cn } from '@/lib/utils'

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

  const totalAlertas = (d?.alertas.sin_respuesta_48h ?? 0) +
    (d?.alertas.tareas_vencidas ?? 0) +
    (d?.alertas.leads_inactivos ?? 0)

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Inteligencia comercial en tiempo real</p>
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
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(d?.alertas.sin_respuesta_48h ?? 0) > 0 && (
              <button
                onClick={() => router.push('/leads?view=kanban&estado_pipeline=sin_respuesta')}
                className="text-sm text-amber-800 hover:text-amber-900 hover:underline"
              >
                <strong>{d!.alertas.sin_respuesta_48h}</strong> lead{d!.alertas.sin_respuesta_48h !== 1 ? 's' : ''} sin respuesta +48h
              </button>
            )}
            {(d?.alertas.tareas_vencidas ?? 0) > 0 && (
              <button
                onClick={() => router.push('/leads/tareas')}
                className="text-sm text-amber-800 hover:text-amber-900 hover:underline"
              >
                <strong>{d!.alertas.tareas_vencidas}</strong> tarea{d!.alertas.tareas_vencidas !== 1 ? 's' : ''} vencida{d!.alertas.tareas_vencidas !== 1 ? 's' : ''}
              </button>
            )}
            {(d?.alertas.leads_inactivos ?? 0) > 0 && (
              <button
                onClick={() => router.push('/leads')}
                className="text-sm text-amber-800 hover:text-amber-900 hover:underline"
              >
                <strong>{d!.alertas.leads_inactivos}</strong> lead{d!.alertas.leads_inactivos !== 1 ? 's' : ''} inactivo{d!.alertas.leads_inactivos !== 1 ? 's' : ''} (sin movimiento &gt;7d)
              </button>
            )}
          </div>
        </div>
      )}

      {/* KPI cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white rounded-xl border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Revenue Intelligence + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Revenue Intelligence */}
        <div className="bg-white rounded-xl border p-5 space-y-5">
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
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Activity size={15} className="text-slate-400" />
            Pipeline por etapa
          </h2>
          <div className="space-y-2">
            {PIPELINE_STAGES.map(({ value }) => {
              const count = d?.leads.por_etapa[value] ?? 0
              const total = d?.leads.total ?? 1
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              const config = PIPELINE_STAGE_MAP[value]
              return (
                <div
                  key={value}
                  className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded px-1 py-1 -mx-1 -my-1 transition-colors"
                  onClick={() => router.push(`/leads?view=kanban&estado_pipeline=${value}`)}
                >
                  <span className="text-xs text-slate-500 w-36 flex-shrink-0 truncate">{config.label}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: isLoading ? '0%' : `${pct}%`, backgroundColor: config.color }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-700 w-8 text-right">
                    {isLoading ? '—' : count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Top responsables + Live feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Top responsables */}
        <div className="bg-white rounded-xl border p-5">
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
        <div className="bg-white rounded-xl border p-5">
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
                      <p className="text-xs text-slate-400">{lead.fuente ?? 'desconocido'} · {timeAgo(lead.created_at)}</p>
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
      {!isLoading && d && Object.keys(d.leads.por_fuente).length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <Clock size={15} className="text-slate-400" />
            Leads por fuente
          </h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(d.leads.por_fuente)
              .sort(([, a], [, b]) => b - a)
              .map(([fuente, count]) => (
                <div key={fuente} className="flex items-center gap-2 bg-slate-50 rounded-lg px-4 py-2.5">
                  <span className="text-sm text-slate-600 capitalize">{fuente}</span>
                  <span className="text-sm font-semibold text-slate-900">{count}</span>
                  <span className="text-xs text-slate-400">
                    ({d.leads.total > 0 ? Math.round((count / d.leads.total) * 100) : 0}%)
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Leads por país */}
      {!isLoading && d && Object.keys(d.leads.por_pais).length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <Globe size={15} className="text-slate-400" />
            Leads por país
          </h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(d.leads.por_pais)
              .sort(([, a], [, b]) => b - a)
              .map(([pais, count]) => (
                <div key={pais} className="flex items-center gap-2 bg-slate-50 rounded-lg px-4 py-2.5">
                  <span className="text-sm text-slate-600">{pais}</span>
                  <span className="text-sm font-semibold text-slate-900">{count}</span>
                  <span className="text-xs text-slate-400">
                    ({d.leads.total > 0 ? Math.round((count / d.leads.total) * 100) : 0}%)
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
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
