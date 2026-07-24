'use client'

import { useState, useEffect } from 'react'
import { X, AlignLeft, CheckCircle2, Circle, Plus, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { ProjectTask, PmPriority, ProjectTaskEstado, TaskSection, User } from '@/types'

const PRIORITY_OPTS: { value: PmPriority; label: string }[] = [
  { value: 'baja',    label: 'Baja'    },
  { value: 'media',   label: 'Media'   },
  { value: 'alta',    label: 'Alta'    },
  { value: 'urgente', label: 'Urgente' },
]

const STATUS_OPTS: { value: ProjectTaskEstado; label: string }[] = [
  { value: 'pendiente',   label: 'Pendiente'   },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'bloqueada',   label: 'Bloqueada'   },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'finalizada',  label: 'Finalizada'  },
  { value: 'cancelada',   label: 'Cancelada'   },
]

interface Props {
  task: ProjectTask
  sections: TaskSection[]
  allTasks: ProjectTask[]          // needed to render subtasks
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
  projectId: string
  onClose: () => void
  onUpdate: (updates: Partial<ProjectTask>) => void
  onAddSubtask: (titulo: string) => void
  onToggleTask: (taskId: string, isDone: boolean) => void
}

export function TaskPanel({ task, sections, allTasks, users, projectId, onClose, onUpdate, onAddSubtask, onToggleTask }: Props) {
  const [titulo,      setTitulo]      = useState(task.titulo)
  const [descripcion, setDescripcion] = useState(task.descripcion ?? '')
  const [addingSub,   setAddingSub]   = useState(false)
  const [subInput,    setSubInput]    = useState('')

  useEffect(() => {
    setTitulo(task.titulo)
    setDescripcion(task.descripcion ?? '')
  }, [task.id])

  const isDone    = task.estado === 'finalizada'
  const isOverdue = task.fecha_limite && !isDone && new Date(task.fecha_limite) < new Date()
  const assignee  = users.find(u => u.id === task.assignee_id) ?? null
  const subtasks  = allTasks.filter(t => t.parent_task_id === task.id && !t.deleted_at)

  function blurTitle() {
    const t = titulo.trim()
    if (t && t !== task.titulo) onUpdate({ titulo: t })
  }
  function blurDesc() {
    const d = descripcion.trim() || null
    if (d !== (task.descripcion ?? null)) onUpdate({ descripcion: d })
  }
  function submitSub() {
    const t = subInput.trim()
    if (!t) return
    onAddSubtask(t)
    setSubInput('')
    setAddingSub(false)
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
        <button
          onClick={() => onUpdate({ estado: isDone ? 'pendiente' : 'finalizada' })}
          className={cn(
            'flex items-center gap-2 text-sm font-medium transition-colors',
            isDone ? 'text-green-600' : 'text-slate-500 hover:text-green-600'
          )}
        >
          {isDone ? <CheckCircle2 size={17} className="text-green-500" /> : <Circle size={17} />}
          {isDone ? 'Completada' : 'Marcar como hecha'}
        </button>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Title */}
        <div className="px-5 pt-4 pb-2">
          <input
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            onBlur={blurTitle}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            className="w-full text-base font-semibold text-slate-900 outline-none border-0 bg-transparent p-0 leading-snug"
            placeholder="Nombre de la tarea"
          />
        </div>

        {/* Properties */}
        <div className="px-5 py-3 space-y-3 border-b">

          {/* Assignee */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400 w-24 flex-shrink-0">Responsable</span>
            <div className="flex items-center gap-2 flex-1">
              {assignee && (
                <Avatar name={assignee.full_name} url={assignee.avatar_url} size={20} />
              )}
              <select
                value={task.assignee_id ?? ''}
                onChange={e => onUpdate({ assignee_id: e.target.value || null })}
                className="text-xs border border-slate-200 rounded px-2 py-1 flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">Sin asignar</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Status */}
          <PropRow label="Estado">
            <select
              value={task.estado}
              onChange={e => onUpdate({ estado: e.target.value as ProjectTaskEstado })}
              className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </PropRow>

          {/* Priority */}
          <PropRow label="Prioridad">
            <select
              value={task.prioridad}
              onChange={e => onUpdate({ prioridad: e.target.value as PmPriority })}
              className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              {PRIORITY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </PropRow>

          {/* Section */}
          <PropRow label="Sección">
            <select
              value={task.section_id ?? ''}
              onChange={e => onUpdate({ section_id: e.target.value || null })}
              className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">Sin sección</option>
              {sections.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </PropRow>

          {/* Due date */}
          <PropRow label="Fecha límite">
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={task.fecha_limite ?? ''}
                onChange={e => onUpdate({ fecha_limite: e.target.value || null })}
                className={cn(
                  'text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500',
                  isOverdue ? 'border-red-300 text-red-600' : 'border-slate-200'
                )}
              />
              {isOverdue && <span className="text-xs text-red-500 font-medium">Vencida</span>}
            </div>
          </PropRow>

          {/* Hours */}
          <PropRow label="Horas est.">
            <input
              type="number"
              min="0"
              step="0.5"
              value={task.horas_estimadas ?? ''}
              onChange={e => onUpdate({ horas_estimadas: e.target.value ? Number(e.target.value) : null })}
              placeholder="—"
              className="text-xs border border-slate-200 rounded px-2 py-1 w-20 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </PropRow>
        </div>

        {/* Description */}
        <div className="px-5 py-4 border-b">
          <div className="flex items-center gap-1.5 mb-2">
            <AlignLeft size={12} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Descripción</span>
          </div>
          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            onBlur={blurDesc}
            rows={4}
            placeholder="Agregar descripción..."
            className="w-full text-sm text-slate-700 border border-slate-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Subtasks */}
        <div className="px-5 py-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500">
              Subtareas {subtasks.length > 0 && `(${subtasks.filter(t => t.estado === 'finalizada').length}/${subtasks.length})`}
            </span>
            {!addingSub && (
              <button
                onClick={() => setAddingSub(true)}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Plus size={11} /> Agregar
              </button>
            )}
          </div>

          <div className="space-y-1">
            {subtasks.sort((a, b) => a.position - b.position).map(sub => {
              const subDone = sub.estado === 'finalizada'
              return (
                <div key={sub.id} className="flex items-center gap-2 py-1 group">
                  <button
                    onClick={() => onToggleTask(sub.id, !subDone)}
                    className={cn('flex-shrink-0 transition-colors', subDone ? 'text-green-500' : 'text-slate-300 hover:text-green-500')}
                  >
                    {subDone ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                  </button>
                  <span className={cn('text-xs flex-1 min-w-0 truncate', subDone ? 'line-through text-slate-400' : 'text-slate-700')}>
                    {sub.titulo}
                  </span>
                </div>
              )
            })}
            {subtasks.length === 0 && !addingSub && (
              <p className="text-xs text-slate-300">Sin subtareas</p>
            )}
          </div>

          {addingSub && (
            <div className="flex items-center gap-2 mt-2">
              <input
                autoFocus
                value={subInput}
                onChange={e => setSubInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitSub()
                  if (e.key === 'Escape') { setAddingSub(false); setSubInput('') }
                }}
                placeholder="Nombre de la subtarea"
                className="flex-1 text-xs border border-blue-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button onClick={submitSub} disabled={!subInput.trim()} className="text-xs font-medium text-blue-600 disabled:opacity-50">OK</button>
              <button onClick={() => { setAddingSub(false); setSubInput('') }} className="text-xs text-slate-400">✕</button>
            </div>
          )}
        </div>

        {/* Footer meta */}
        <div className="px-5 py-4 space-y-1">
          <p className="text-xs text-slate-400">
            Creada {format(new Date(task.created_at), "d 'de' MMM yyyy", { locale: es })}
          </p>
        </div>
      </div>
    </div>
  )
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-24 flex-shrink-0">{label}</span>
      {children}
    </div>
  )
}

export function Avatar({
  name,
  url,
  size = 24,
}: {
  name: string
  url: string | null
  size?: number
}) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        title={name}
        style={{ width: size, height: size }}
        className="rounded-full object-cover flex-shrink-0"
      />
    )
  }
  return (
    <div
      title={name}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold flex-shrink-0"
    >
      {initials}
    </div>
  )
}
