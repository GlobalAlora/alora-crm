'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus, AlertCircle } from 'lucide-react'
import { format, isPast, isToday, isTomorrow } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import type { Task } from '@/types'
import { tasksApi } from '@/lib/api'
import { cn } from '@/lib/utils'

interface TaskListProps {
  leadId: string
}

export function TaskList({ leadId }: TaskListProps) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [vencimiento, setVencimiento] = useState('')

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', leadId],
    queryFn: () => tasksApi.list(leadId),
    staleTime: 0,
  })

  const createMutation = useMutation({
    mutationFn: () => tasksApi.create(leadId, { titulo, vencimiento: vencimiento || undefined }),
    onSuccess: () => {
      setTitulo('')
      setVencimiento('')
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: ['tasks', leadId] })
    },
    onError: () => toast.error('Error al crear la tarea'),
  })

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => tasksApi.complete(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', leadId] })
      queryClient.invalidateQueries({ queryKey: ['activities', leadId] })
    },
    onError: () => toast.error('Error al completar la tarea'),
  })

  const pending = tasks.filter((t) => !t.completada)
  const done = tasks.filter((t) => t.completada)

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Tareas</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          <Plus size={13} />
          Nueva tarea
        </button>
      </div>

      {showForm && (
        <div className="mb-3 p-3 border rounded-lg bg-slate-50 space-y-2">
          <input
            autoFocus
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título de la tarea"
            className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="datetime-local"
            value={vencimiento}
            onChange={(e) => setVencimiento(e.target.value)}
            className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
          />
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!titulo.trim() || createMutation.isPending}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Guardar
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-xs text-slate-500 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="h-8 bg-slate-100 rounded animate-pulse" />}

      <div className="space-y-1.5">
        {pending.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onComplete={() => completeMutation.mutate(task.id)}
            isCompleting={completeMutation.isPending}
          />
        ))}
        {done.slice(0, 3).map((task) => (
          <TaskItem key={task.id} task={task} onComplete={() => {}} isCompleting={false} />
        ))}
      </div>

      {!isLoading && tasks.length === 0 && !showForm && (
        <p className="text-xs text-slate-400 py-2">Sin tareas pendientes</p>
      )}
    </div>
  )
}

function dueDateLabel(date: string): { label: string; urgent: boolean } {
  const d = new Date(date)
  if (isPast(d) && !isToday(d)) return { label: 'Vencida', urgent: true }
  if (isToday(d)) return { label: 'Hoy', urgent: true }
  if (isTomorrow(d)) return { label: 'Mañana', urgent: false }
  return { label: format(d, "d MMM", { locale: es }), urgent: false }
}

interface TaskItemProps {
  task: Task
  onComplete: () => void
  isCompleting: boolean
}

function TaskItem({ task, onComplete, isCompleting }: TaskItemProps) {
  const due = task.vencimiento ? dueDateLabel(task.vencimiento) : null

  return (
    <div className={cn('flex items-start gap-2 p-2 rounded-lg', task.completada ? 'opacity-50' : 'hover:bg-slate-50')}>
      <button
        onClick={onComplete}
        disabled={task.completada || isCompleting}
        className={cn(
          'w-4 h-4 rounded border flex-shrink-0 mt-0.5 transition-colors',
          task.completada
            ? 'bg-emerald-500 border-emerald-500'
            : 'border-slate-300 hover:border-blue-400'
        )}
      >
        {task.completada && (
          <svg viewBox="0 0 14 14" fill="none" className="w-full h-full p-0.5">
            <path d="M2 7l4 4 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm text-slate-700', task.completada && 'line-through')}>{task.titulo}</p>
        {due && (
          <div className={cn('flex items-center gap-1 mt-0.5', due.urgent ? 'text-red-500' : 'text-slate-400')}>
            {due.urgent && <AlertCircle size={11} />}
            <span className="text-xs">{due.label}</span>
          </div>
        )}
      </div>
    </div>
  )
}
