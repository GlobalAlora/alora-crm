'use client'

import { cn, getDaysUntil, parseLocalDate } from '@/lib/utils'
import type { Project, TaskSection, ProjectTask, User } from '@/types'
import { Avatar } from './TaskPanel'
import { differenceInDays } from 'date-fns'
import { AlertCircle, CheckCircle2, Clock, Users } from 'lucide-react'

interface Props {
  project: Project & { sections?: (TaskSection & { tasks?: ProjectTask[] })[] }
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
}

const STATUS_OPTS = [
  { value: 'pendiente',   label: 'Pendiente',   color: 'bg-slate-300' },
  { value: 'en_progreso', label: 'En progreso', color: 'bg-blue-500'  },
  { value: 'bloqueada',   label: 'Bloqueada',   color: 'bg-red-500'   },
  { value: 'en_revision', label: 'En revisión', color: 'bg-amber-500' },
  { value: 'finalizada',  label: 'Finalizada',  color: 'bg-green-500' },
  { value: 'cancelada',   label: 'Cancelada',   color: 'bg-slate-200' },
]

export function ResumenView({ project, users }: Props) {
  const sections = project.sections ?? []
  const allTasks = sections
    .flatMap(s => s.tasks ?? [])
    .filter(t => !t.deleted_at && !t.parent_task_id)

  const total     = allTasks.length
  const done      = allTasks.filter(t => t.estado === 'finalizada').length
  const overdue   = allTasks.filter(t => t.fecha_limite && t.estado !== 'finalizada' && getDaysUntil(t.fecha_limite) < 0).length
  const unassigned = allTasks.filter(t => !t.assignee_id).length
  const pct       = total > 0 ? Math.round(done / total * 100) : 0

  const daysLeft = project.fecha_fin
    ? differenceInDays(new Date(project.fecha_fin), new Date())
    : null

  const byStatus = STATUS_OPTS.map(s => ({
    ...s,
    count: allTasks.filter(t => t.estado === s.value).length,
  })).filter(s => s.count > 0)

  const byAssignee = users.map(u => ({
    user: u,
    count: allTasks.filter(t => t.assignee_id === u.id).length,
  })).filter(a => a.count > 0)

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            icon={<CheckCircle2 size={16} className="text-green-500" />}
            label="Completado"
            value={`${pct}%`}
            sub={`${done} de ${total} tareas`}
          />
          <MetricCard
            icon={<Clock size={16} className="text-blue-500" />}
            label="Pendientes"
            value={total - done}
            sub="tareas restantes"
          />
          <MetricCard
            icon={<AlertCircle size={16} className={overdue > 0 ? 'text-red-500' : 'text-slate-400'} />}
            label="Vencidas"
            value={overdue}
            sub="sin completar"
            valueClass={overdue > 0 ? 'text-red-600' : undefined}
          />
          {daysLeft !== null ? (
            <MetricCard
              icon={<Clock size={16} className={daysLeft < 0 ? 'text-red-500' : 'text-slate-400'} />}
              label="Días restantes"
              value={daysLeft < 0 ? 'Vencido' : daysLeft}
              sub={daysLeft < 0 ? 'Entrega pasada' : 'para la entrega'}
              valueClass={daysLeft < 0 ? 'text-red-600' : undefined}
            />
          ) : (
            <MetricCard
              icon={<Users size={16} className="text-slate-400" />}
              label="Sin asignar"
              value={unassigned}
              sub="tareas"
            />
          )}
        </div>

        {/* Progress by section */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Progreso por sección</h3>
          {sections.length === 0 ? (
            <p className="text-xs text-slate-400">Sin secciones</p>
          ) : (
            <div className="space-y-4">
              {sections
                .sort((a, b) => a.position - b.position)
                .map(s => {
                  const tasks  = (s.tasks ?? []).filter(t => !t.deleted_at && !t.parent_task_id)
                  const done   = tasks.filter(t => t.estado === 'finalizada').length
                  const pct    = tasks.length > 0 ? Math.round(done / tasks.length * 100) : 0
                  return (
                    <div key={s.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: s.color ?? '#94A3B8' }} />
                          <span className="text-xs font-medium text-slate-700">{s.nombre}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>{done}/{tasks.length}</span>
                          <span className="w-8 text-right font-medium text-slate-600">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>

        {/* Status breakdown + Team */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Tareas por estado</h3>
            {byStatus.length === 0 ? (
              <p className="text-xs text-slate-400">Sin tareas</p>
            ) : (
              <div className="space-y-2.5">
                {byStatus.map(s => (
                  <div key={s.value} className="flex items-center gap-3">
                    <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', s.color)} />
                    <span className="text-sm text-slate-600 flex-1">{s.label}</span>
                    <span className="text-sm font-semibold text-slate-700">{s.count}</span>
                    <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', s.color)}
                        style={{ width: total > 0 ? `${(s.count / total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Equipo asignado</h3>
            {byAssignee.length === 0 && unassigned === 0 ? (
              <p className="text-xs text-slate-400">Sin tareas asignadas</p>
            ) : (
              <div className="space-y-3">
                {byAssignee.map(({ user, count }) => (
                  <div key={user.id} className="flex items-center gap-3">
                    <Avatar name={user.full_name} url={user.avatar_url} size={26} />
                    <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{user.full_name}</span>
                    <span className="text-xs text-slate-500 whitespace-nowrap">{count} tarea{count !== 1 ? 's' : ''}</span>
                  </div>
                ))}
                {unassigned > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-slate-400">?</span>
                    </div>
                    <span className="text-sm text-slate-400 flex-1">Sin asignar</span>
                    <span className="text-xs text-slate-400">{unassigned}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Overdue tasks */}
        {overdue > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
              <AlertCircle size={14} /> Tareas vencidas ({overdue})
            </h3>
            <div className="space-y-2">
              {allTasks
                .filter(t => t.fecha_limite && t.estado !== 'finalizada' && getDaysUntil(t.fecha_limite) < 0)
                .slice(0, 5)
                .map(t => {
                  const assignee = t.assignee_id ? users.find(u => u.id === t.assignee_id) : null
                  return (
                    <div key={t.id} className="flex items-center gap-3">
                      <span className="text-xs text-red-600 flex-1 min-w-0 truncate">{t.titulo}</span>
                      {assignee && <Avatar name={assignee.full_name} url={assignee.avatar_url} size={18} />}
                      <span className="text-xs text-red-500 whitespace-nowrap">
                        {parseLocalDate(t.fecha_limite!).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  icon, label, value, sub, valueClass,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub: string
  valueClass?: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className={cn('text-2xl font-bold text-slate-900', valueClass)}>{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
    </div>
  )
}
