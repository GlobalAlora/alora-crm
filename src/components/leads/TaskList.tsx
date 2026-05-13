'use client'

import { format, isPast, isToday, isTomorrow } from 'date-fns'
import { es } from 'date-fns/locale'
import { useState } from 'react'
import { Clock, Trash2, Plus, X, AlertCircle, Pencil, Check } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import type { Task } from '@/types'
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
    queryFn: async () => {
      const response = await fetch(`/api/leads/${leadId}/tasks`)
      if (!response.ok) throw new Error('Failed to fetch tasks')
      const result = await response.json()
      return result.data || []
    },
    staleTime: 0,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      // Send datetime-local directly, backend will handle timezone conversion
      const response = await fetch(`/api/leads/${leadId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, vencimiento })
      })
      if (!response.ok) throw new Error('Failed to create task')
      const result = await response.json()
      return result.data
    },
    onSuccess: () => {
      setTitulo('')
      setVencimiento('')
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: ['tasks', leadId] })
      toast.success('Tarea creada')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Pick<Task, 'titulo' | 'vencimiento'>> }) => {
      const response = await fetch(`/api/leads/${leadId}/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      if (!response.ok) throw new Error('Failed to update task')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', leadId] })
      toast.success('Tarea actualizada')
    },
    onError: () => toast.error('Error al actualizar la tarea'),
  })

  const completeMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await fetch(`/api/leads/${leadId}/tasks/${taskId}/complete`, {
        method: 'PATCH'
      })
      if (!response.ok) throw new Error('Failed to complete task')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', leadId] })
      toast.success('Tarea completada')
    },
    onError: () => toast.error('Error al completar la tarea'),
  })

  const uncompleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await fetch(`/api/leads/${leadId}/tasks/${taskId}/uncomplete`, {
        method: 'PATCH'
      })
      if (!response.ok) throw new Error('Failed to uncomplete task')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', leadId] })
      toast.success('Tarea reabierta')
    },
    onError: () => toast.error('Error al reabrir la tarea'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await fetch(`/api/leads/${leadId}/tasks/${taskId}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Failed to delete task')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', leadId] })
      toast.success('Tarea eliminada')
    },
    onError: () => toast.error('Error al eliminar la tarea'),
  })

  const pending = tasks.filter((t: Task) => !t.completada)
  const done = tasks.filter((t: Task) => t.completada)

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
            onKeyDown={(e) => { if (e.key === 'Enter' && titulo.trim()) createMutation.mutate() }}
            className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="block">
            <span className="text-xs text-slate-500 mb-1 block">Fecha y hora de vencimiento</span>
            <input
              type="datetime-local"
              value={vencimiento}
              onChange={(e) => setVencimiento(e.target.value)}
              step="60"
              min=""
              className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
              style={{ 
                colorScheme: 'light',
                fontSize: '14px',
                padding: '6px 8px'
              }}
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!titulo.trim() || createMutation.isPending}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Guardar
            </button>
            <button
              onClick={() => { setShowForm(false); setTitulo(''); setVencimiento('') }}
              className="text-xs text-slate-500 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="h-8 bg-slate-100 rounded animate-pulse" />}

      <div className="space-y-1.5">
        {pending.map((task: Task) => (
          <TaskItem
            key={task.id}
            task={task}
            onComplete={() => completeMutation.mutate(task.id)}
            onDelete={() => { if (confirm('¿Eliminar esta tarea?')) deleteMutation.mutate(task.id) }}
            onUpdate={(data) => updateMutation.mutate({ id: task.id, data })}
            isCompleting={completeMutation.isPending}
            isDeleting={deleteMutation.isPending}
          />
        ))}

        {done.length > 0 && (
          <>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide pt-2 pb-1">
              Completadas ({done.length})
            </p>
            {done.slice(0, 5).map((task: Task) => (
              <TaskItem
                key={task.id}
                task={task}
                onComplete={() => uncompleteMutation.mutate(task.id)}
                onDelete={() => { if (confirm('¿Eliminar esta tarea?')) deleteMutation.mutate(task.id) }}
                onUpdate={(data) => updateMutation.mutate({ id: task.id, data })}
                isCompleting={uncompleteMutation.isPending}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </>
        )}
      </div>

      {!isLoading && tasks.length === 0 && !showForm && (
        <p className="text-xs text-slate-400 py-2">Sin tareas pendientes</p>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDueDate(date: string): { label: string; urgent: boolean } {
  const d = new Date(date)
  // Use Argentina timezone for all comparisons and display
  const ar = new Date(d.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const hasTime = ar.getHours() !== 0 || ar.getMinutes() !== 0 || ar.getSeconds() !== 0
  const timeStr = hasTime ? ` ${format(ar, 'HH:mm')}` : ''

  if (isPast(ar) && !isToday(ar)) {
    return { label: `Vencida · ${format(ar, "d MMM yyyy", { locale: es })}${timeStr}`, urgent: true }
  }
  if (isToday(ar)) return { label: `Hoy${timeStr}`, urgent: true }
  if (isTomorrow(ar)) return { label: `Mañana${timeStr}`, urgent: false }
  return { label: `${format(ar, "d 'de' MMMM yyyy", { locale: es })}${timeStr}`, urgent: false }
}

// Convert ISO date to datetime-local input value in Argentina timezone (YYYY-MM-DDTHH:mm)
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  // Always use Argentina timezone so the edit field shows the correct local time
  const ar = new Date(d.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${ar.getFullYear()}-${pad(ar.getMonth() + 1)}-${pad(ar.getDate())}T${pad(ar.getHours())}:${pad(ar.getMinutes())}`
}

// ── TaskItem ──────────────────────────────────────────────────────────────────

interface TaskItemProps {
  task: Task
  onComplete: () => void
  onDelete: () => void
  onUpdate: (data: Partial<Pick<Task, 'titulo' | 'vencimiento'>>) => void
  isCompleting: boolean
  isDeleting: boolean
}

function TaskItem({ task, onComplete, onDelete, onUpdate, isCompleting, isDeleting }: TaskItemProps) {
  const [editing, setEditing] = useState(false)
  const [draftTitulo, setDraftTitulo] = useState(task.titulo)
  const [draftVenc, setDraftVenc] = useState(toDatetimeLocal(task.vencimiento))
  const due = task.vencimiento ? formatDueDate(task.vencimiento) : null

  const startEdit = () => {
    setDraftTitulo(task.titulo)
    setDraftVenc(toDatetimeLocal(task.vencimiento))
    setEditing(true)
  }

  const saveEdit = () => {
    if (!draftTitulo.trim()) return
    // Preserve datetime-local as-is without timezone conversion
    let vencimiento: string | undefined
    if (draftVenc) {
      vencimiento = draftVenc
    }
    onUpdate({
      titulo: draftTitulo.trim(),
      vencimiento,
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="p-2 rounded-lg border border-blue-200 bg-blue-50 space-y-2">
        <input
          autoFocus
          value={draftTitulo}
          onChange={(e) => setDraftTitulo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(false) }}
          className="w-full text-sm border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <div>
          <span className="text-xs text-slate-500 mb-1 block">Fecha y hora</span>
          <input
            type="datetime-local"
            value={draftVenc}
            onChange={(e) => setDraftVenc(e.target.value)}
            className="w-full text-sm border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-700"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={saveEdit}
            disabled={!draftTitulo.trim()}
            className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Check size={11} /> Guardar
          </button>
          <button
            onClick={() => setEditing(false)}
            className="flex items-center gap-1 text-xs text-slate-500 px-2.5 py-1 rounded hover:bg-slate-200 transition-colors"
          >
            <X size={11} /> Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex items-start gap-2 p-2 rounded-lg group', task.completada ? 'opacity-50' : 'hover:bg-slate-50')}>
      <button
        onClick={onComplete}
        disabled={isCompleting}
        title={task.completada ? 'Marcar como pendiente' : 'Marcar como completada'}
        className={cn(
          'w-4 h-4 rounded border flex-shrink-0 mt-0.5 transition-colors',
          task.completada
            ? 'bg-emerald-500 border-emerald-500 hover:bg-emerald-600'
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
            {due.urgent ? <AlertCircle size={11} /> : <Clock size={11} />}
            <span className="text-xs">{due.label}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {!task.completada && (
          <button
            onClick={startEdit}
            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Editar tarea"
          >
            <Pencil size={12} />
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-50 transition-colors"
          title="Eliminar tarea"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
