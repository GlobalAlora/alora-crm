'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  CheckSquare, Clock, Trash2, RotateCcw, AlertCircle,
  CheckCircle2, Calendar, ExternalLink,
} from 'lucide-react'
import { format, isPast, isToday, isTomorrow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { tasksApi } from '@/lib/api'
import type { GlobalTask } from '@/lib/api'
import { cn } from '@/lib/utils'
import { PIPELINE_STAGE_MAP } from '@/types'

type Filter = 'pendientes' | 'completadas' | 'todas'

export default function TareasPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('pendientes')
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTitle, setRescheduleTitle] = useState('')
  const [rescheduleDescription, setRescheduleDescription] = useState('')

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks-global', filter],
    queryFn: () =>
      tasksApi.listAll(
        filter === 'pendientes' ? { completada: false }
        : filter === 'completadas' ? { completada: true }
        : undefined
      ),
    staleTime: 0,
  })

  const completeMutation = useMutation({
    mutationFn: (id: string) => tasksApi.complete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-global'] })
      toast.success('Tarea completada')
    },
    onError: () => toast.error('Error al completar'),
  })

  const uncompleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.update(id, { completada: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-global'] })
      toast.success('Tarea marcada como pendiente')
    },
    onError: () => toast.error('Error al desmarcar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-global'] })
      toast.success('Tarea eliminada')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, vencimiento, titulo, descripcion }: { id: string; vencimiento: string; titulo?: string; descripcion?: string }) =>
      tasksApi.update(id, { vencimiento, titulo, descripcion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks-global'] })
      setRescheduleId(null)
      setRescheduleDate('')
      setRescheduleTitle('')
      setRescheduleDescription('')
      toast.success('Tarea actualizada')
    },
    onError: () => toast.error('Error al actualizar tarea'),
  })

  // Group pending tasks by urgency
  const pending = tasks.filter((t) => !t.completada)
  const done = tasks.filter((t) => t.completada)

  const overdue = pending.filter((t) => t.vencimiento && isPast(parseISO(t.vencimiento)) && !isToday(parseISO(t.vencimiento)))
  const todayTasks = pending.filter((t) => t.vencimiento && isToday(parseISO(t.vencimiento)))
  const tomorrowTasks = pending.filter((t) => t.vencimiento && isTomorrow(parseISO(t.vencimiento)))
  const upcoming = pending.filter((t) => {
    if (!t.vencimiento) return false
    const d = parseISO(t.vencimiento)
    return !isPast(d) && !isToday(d) && !isTomorrow(d)
  })
  const noDate = pending.filter((t) => !t.vencimiento)

  const groups =
    filter === 'completadas'
      ? [{ label: 'Completadas', tasks: done, variant: 'done' as const }]
      : [
          { label: 'Vencidas', tasks: overdue, variant: 'overdue' as const },
          { label: 'Hoy', tasks: todayTasks, variant: 'today' as const },
          { label: 'Mañana', tasks: tomorrowTasks, variant: 'normal' as const },
          { label: 'Próximas', tasks: upcoming, variant: 'normal' as const },
          { label: 'Sin fecha', tasks: noDate, variant: 'normal' as const },
        ].filter((g) => g.tasks.length > 0)

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tareas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {pending.length} pendiente{pending.length !== 1 ? 's' : ''}
            {overdue.length > 0 && (
              <span className="text-red-500 ml-2">· {overdue.length} vencida{overdue.length !== 1 ? 's' : ''}</span>
            )}
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center border rounded-lg overflow-hidden text-sm">
          {(['pendientes', 'completadas', 'todas'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 font-medium capitalize transition-colors',
                filter === f ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-white rounded-xl border animate-pulse" />)}
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <CheckCircle2 size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">
            {filter === 'pendientes' ? '¡Todo al día! Sin tareas pendientes.' : 'Sin tareas en esta categoría.'}
          </p>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          <div className="flex items-center gap-2">
            {group.variant === 'overdue' && <AlertCircle size={14} className="text-red-500" />}
            {group.variant === 'today' && <Clock size={14} className="text-amber-500" />}
            <h2 className={cn(
              'text-xs font-semibold uppercase tracking-wide',
              group.variant === 'overdue' ? 'text-red-500'
              : group.variant === 'today' ? 'text-amber-600'
              : 'text-slate-400'
            )}>
              {group.label} · {group.tasks.length}
            </h2>
          </div>

          <div className="space-y-1.5">
            {group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                rescheduleId={rescheduleId}
                rescheduleDate={rescheduleDate}
                rescheduleTitle={rescheduleTitle}
                rescheduleDescription={rescheduleDescription}
                onComplete={() => completeMutation.mutate(task.id)}
                onUncomplete={() => uncompleteMutation.mutate(task.id)}
                onDelete={() => deleteMutation.mutate(task.id)}
                onRescheduleOpen={() => {
                  setRescheduleId(task.id)
                  setRescheduleDate(task.vencimiento ? task.vencimiento.slice(0, 16) : '')
                  setRescheduleTitle(task.titulo)
                  setRescheduleDescription(task.descripcion || '')
                }}
                onRescheduleCancel={() => setRescheduleId(null)}
                onRescheduleSave={() => rescheduleMutation.mutate({ 
                  id: task.id, 
                  vencimiento: rescheduleDate,
                  titulo: rescheduleTitle,
                  descripcion: rescheduleDescription
                })}
                onRescheduleDateChange={setRescheduleDate}
                onRescheduleTitleChange={setRescheduleTitle}
                onRescheduleDescriptionChange={setRescheduleDescription}
                onLeadClick={() => task.lead && router.push(`/leads/${task.lead.id}`)}
                isCompleting={completeMutation.isPending}
                isUncompleting={uncompleteMutation.isPending}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

interface TaskRowProps {
  task: GlobalTask
  rescheduleId: string | null
  rescheduleDate: string
  rescheduleTitle: string
  rescheduleDescription: string
  onComplete: () => void
  onUncomplete: () => void
  onDelete: () => void
  onRescheduleOpen: () => void
  onRescheduleCancel: () => void
  onRescheduleSave: () => void
  onRescheduleDateChange: (v: string) => void
  onRescheduleTitleChange: (v: string) => void
  onRescheduleDescriptionChange: (v: string) => void
  onLeadClick: () => void
  isCompleting: boolean
  isUncompleting: boolean
  isDeleting: boolean
}

function TaskRow({
  task, rescheduleId, rescheduleDate, rescheduleTitle, rescheduleDescription,
  onComplete, onUncomplete, onDelete, onRescheduleOpen, onRescheduleCancel, onRescheduleSave,
  onRescheduleDateChange, onRescheduleTitleChange, onRescheduleDescriptionChange,
  onLeadClick, isCompleting, isUncompleting, isDeleting,
}: TaskRowProps) {
  const isRescheduling = rescheduleId === task.id

  const due = task.vencimiento ? (() => {
    const d = parseISO(task.vencimiento)
    if (task.completada) return { label: format(d, "d MMM yyyy, HH:mm", { locale: es }), urgent: false }
    if (isPast(d) && !isToday(d)) return { label: `Vencida · ${format(d, "d MMM", { locale: es })}`, urgent: true }
    if (isToday(d)) return { label: `Hoy ${format(d, "HH:mm")}`, urgent: true }
    if (isTomorrow(d)) return { label: `Mañana ${format(d, "HH:mm")}`, urgent: false }
    return { label: format(d, "d MMM, HH:mm", { locale: es }), urgent: false }
  })() : null

  const leadName = task.lead
    ? [task.lead.nombre, (task.lead as { apellido?: string | null }).apellido].filter(Boolean).join(' ')
    : null

  const stageConfig = task.lead?.estado_pipeline
    ? PIPELINE_STAGE_MAP[task.lead.estado_pipeline as keyof typeof PIPELINE_STAGE_MAP]
    : null

  return (
    <div className="bg-white rounded-xl border hover:border-slate-300 transition-colors p-3">
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={task.completada ? onUncomplete : onComplete}
          disabled={isCompleting || isUncompleting}
          title={task.completada ? 'Marcar como pendiente' : 'Marcar como completada'}
          className={cn(
            'w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 transition-colors flex items-center justify-center',
            task.completada
              ? 'bg-emerald-500 border-emerald-500 hover:bg-emerald-600'
              : 'border-slate-300 hover:border-blue-400'
          )}
        >
          {task.completada && (
            <svg viewBox="0 0 14 14" fill="none" className="w-3 h-3">
              <path d="M2 7l4 4 6-6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium text-slate-800', task.completada && 'line-through text-slate-400')}>
            {task.titulo}
          </p>

          {task.descripcion && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{task.descripcion}</p>
          )}

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {/* Due date */}
            {due && (
              <div className={cn('flex items-center gap-1', due.urgent && !task.completada ? 'text-red-500' : 'text-slate-400')}>
                {due.urgent && !task.completada && <AlertCircle size={11} />}
                <Calendar size={11} />
                <span className="text-xs">{due.label}</span>
              </div>
            )}

            {/* Lead link */}
            {leadName && (
              <button
                onClick={onLeadClick}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors"
              >
                <ExternalLink size={10} />
                <span className="truncate max-w-[140px]">{leadName}</span>
                {stageConfig && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-xs font-medium"
                    style={{ color: stageConfig.color, backgroundColor: stageConfig.bgColor }}
                  >
                    {stageConfig.label}
                  </span>
                )}
              </button>
            )}

            {/* Assignee */}
            {task.asignado && (
              <span className="text-xs text-slate-400">→ {task.asignado.full_name}</span>
            )}
          </div>

          {/* Reschedule form */}
          {isRescheduling && (
            <div className="mt-2 space-y-2 p-2 bg-slate-50 rounded-lg">
              <input
                type="text"
                value={rescheduleTitle}
                onChange={(e) => onRescheduleTitleChange(e.target.value)}
                placeholder="Título de la tarea"
                className="w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                value={rescheduleDescription}
                onChange={(e) => onRescheduleDescriptionChange(e.target.value)}
                placeholder="Descripción (opcional)"
                rows={2}
                className="w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={rescheduleDate}
                  onChange={(e) => onRescheduleDateChange(e.target.value)}
                  className="text-xs border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={onRescheduleSave}
                  disabled={!rescheduleTitle.trim()}
                  className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Guardar
                </button>
                <button
                  onClick={onRescheduleCancel}
                  className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {!task.completada && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onRescheduleOpen}
              title="Reagendar"
              className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={onDelete}
              disabled={isDeleting}
              title="Eliminar"
              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
        {task.completada && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onDelete}
              disabled={isDeleting}
              title="Eliminar"
              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
