'use client'

import { useState, useEffect } from 'react'
import { X, AlignLeft, CheckCircle2, Circle, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { ProjectTask, PmPriority, ProjectTaskEstado, TaskSection } from '@/types'

const PRIORITY_OPTS: { value: PmPriority; label: string; color: string }[] = [
  { value: 'baja',    label: 'Baja',    color: 'text-slate-500' },
  { value: 'media',   label: 'Media',   color: 'text-blue-600'  },
  { value: 'alta',    label: 'Alta',    color: 'text-amber-600' },
  { value: 'urgente', label: 'Urgente', color: 'text-red-600'   },
]

const STATUS_OPTS: { value: ProjectTaskEstado; label: string; dot: string }[] = [
  { value: 'pendiente',   label: 'Pendiente',   dot: 'bg-slate-300'  },
  { value: 'en_progreso', label: 'En progreso', dot: 'bg-blue-500'   },
  { value: 'bloqueada',   label: 'Bloqueada',   dot: 'bg-red-500'    },
  { value: 'en_revision', label: 'En revisión', dot: 'bg-amber-500'  },
  { value: 'finalizada',  label: 'Finalizada',  dot: 'bg-green-500'  },
  { value: 'cancelada',   label: 'Cancelada',   dot: 'bg-slate-200'  },
]

interface Props {
  task: ProjectTask
  sections: TaskSection[]
  onClose: () => void
  onUpdate: (updates: Partial<ProjectTask>) => void
}

export function TaskPanel({ task, sections, onClose, onUpdate }: Props) {
  const [titulo, setTitulo]       = useState(task.titulo)
  const [descripcion, setDescripcion] = useState(task.descripcion ?? '')

  useEffect(() => {
    setTitulo(task.titulo)
    setDescripcion(task.descripcion ?? '')
  }, [task.id])

  const isDone = task.estado === 'finalizada'
  const isOverdue = task.fecha_limite && !isDone && new Date(task.fecha_limite) < new Date()

  function blurTitle() {
    const t = titulo.trim()
    if (t && t !== task.titulo) onUpdate({ titulo: t })
  }

  function blurDesc() {
    const d = descripcion.trim() || null
    if (d !== (task.descripcion ?? null)) onUpdate({ descripcion: d })
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
          {isDone
            ? <CheckCircle2 size={17} className="text-green-500" />
            : <Circle size={17} />
          }
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
        <div className="px-5 py-3 space-y-2.5 border-b">
          <PropRow label="Estado">
            <select
              value={task.estado}
              onChange={e => onUpdate({ estado: e.target.value as ProjectTaskEstado })}
              className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              {STATUS_OPTS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </PropRow>

          <PropRow label="Prioridad">
            <select
              value={task.prioridad}
              onChange={e => onUpdate({ prioridad: e.target.value as PmPriority })}
              className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              {PRIORITY_OPTS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </PropRow>

          <PropRow label="Sección">
            <select
              value={task.section_id ?? ''}
              onChange={e => onUpdate({ section_id: e.target.value || null })}
              className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              <option value="">Sin sección</option>
              {sections.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </PropRow>

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
              {isOverdue && <span className="text-xs text-red-500">Vencida</span>}
            </div>
          </PropRow>

          <PropRow label="Horas est.">
            <input
              type="number"
              min="0"
              step="0.5"
              value={task.horas_estimadas ?? ''}
              onChange={e => onUpdate({ horas_estimadas: e.target.value ? Number(e.target.value) : null })}
              placeholder="—"
              className="text-xs border border-slate-200 rounded px-2 py-1 w-16 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </PropRow>
        </div>

        {/* Description */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-1.5 mb-2">
            <AlignLeft size={12} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Descripción</span>
          </div>
          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            onBlur={blurDesc}
            rows={5}
            placeholder="Agregar descripción..."
            className="w-full text-sm text-slate-700 border border-slate-200 rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Footer meta */}
        <div className="px-5 pb-5 space-y-1">
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
      <span className="text-xs text-slate-400 w-20 flex-shrink-0">{label}</span>
      {children}
    </div>
  )
}
