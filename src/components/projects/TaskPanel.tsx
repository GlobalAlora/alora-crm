'use client'

import { useState, useEffect, useRef } from 'react'
import { X, AlignLeft, CheckCircle2, Circle, Plus, ChevronRight, Paperclip, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { ProjectTask, PmPriority, ProjectTaskEstado, TaskSection, User, TicketAttachment } from '@/types'

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
  onAddSubtask: (opts: { titulo: string; descripcion?: string; assigneeId?: string; fechaLimite?: string; prioridad?: string }) => void
  onToggleTask: (taskId: string, isDone: boolean) => void
}

export function TaskPanel({ task, sections, allTasks, users, projectId, onClose, onUpdate, onAddSubtask, onToggleTask }: Props) {
  const [titulo,       setTitulo]      = useState(task.titulo)
  const [descripcion,  setDescripcion] = useState(task.descripcion ?? '')
  const [showSubModal, setShowSubModal] = useState(false)
  const [isDragOver,   setIsDragOver]  = useState(false)
  const [uploading,    setUploading]   = useState(false)
  const [lightboxUrl,  setLightboxUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter  = useRef(0)

  async function uploadFiles(files: File[]) {
    if (!files.length) return
    setUploading(true)
    const results = await Promise.all(files.map(async (f) => {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/portal/upload', { method: 'POST', body: fd }).then(r => r.json())
      return res.url ? { url: res.url as string, name: res.name ?? f.name, type: res.type ?? f.type } as TicketAttachment : null
    }))
    const valid = results.filter(Boolean) as TicketAttachment[]
    if (valid.length) {
      onUpdate({ attachments: [...(task.attachments ?? []), ...valid] } as Partial<ProjectTask>)
    }
    setUploading(false)
  }

  function removeAttachment(url: string) {
    onUpdate({ attachments: (task.attachments ?? []).filter(a => a.url !== url) } as Partial<ProjectTask>)
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current += 1
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true)
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current === 0) setIsDragOver(false)
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault() }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    uploadFiles(files)
  }

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
  return (
    <div
      className={cn('flex flex-col h-full bg-white border-l border-slate-200 shadow-lg relative', isDragOver && 'ring-2 ring-inset ring-blue-400')}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-20 bg-blue-50/90 flex flex-col items-center justify-center gap-2 pointer-events-none rounded-lg">
          <Paperclip size={28} className="text-blue-500" />
          <p className="text-sm font-medium text-blue-600">Soltar para adjuntar</p>
        </div>
      )}

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightboxUrl(null)}>
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 rounded-full p-1.5">
            <X size={20} />
          </button>
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

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

        {/* Attachments */}
        <div className="px-5 py-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Paperclip size={12} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-500">
                Archivos {(task.attachments ?? []).length > 0 && `(${task.attachments!.length})`}
              </span>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:opacity-50"
            >
              {uploading ? 'Subiendo...' : '+ Adjuntar'}
            </button>
          </div>

          {(task.attachments ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {task.attachments!.map((a, i) => (
                a.type?.startsWith('image/') ? (
                  <div key={i} className="relative group">
                    <button onClick={() => setLightboxUrl(a.url)} className="cursor-zoom-in">
                      <img src={a.url} alt={a.name} className="h-16 w-16 object-cover rounded-lg border border-slate-200 hover:opacity-90 transition-opacity" />
                    </button>
                    <button
                      onClick={() => removeAttachment(a.url)}
                      className="absolute -top-1.5 -right-1.5 bg-white border border-slate-200 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    >
                      <X size={10} className="text-slate-500" />
                    </button>
                  </div>
                ) : (
                  <div key={i} className="relative group flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg max-w-full">
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-600 hover:text-blue-600 truncate max-w-[120px]">
                      {a.name}
                    </a>
                    <button onClick={() => removeAttachment(a.url)} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <X size={10} className="text-slate-400 hover:text-red-500" />
                    </button>
                  </div>
                )
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-300">Arrastrá archivos aquí o usá el botón</p>
          )}
        </div>

        {/* Subtasks */}
        <div className="px-5 py-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500">
              Subtareas {subtasks.length > 0 && `(${subtasks.filter(t => t.estado === 'finalizada').length}/${subtasks.length})`}
            </span>
            <button
              onClick={() => setShowSubModal(true)}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Plus size={11} /> Agregar
            </button>
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
            {subtasks.length === 0 && (
              <p className="text-xs text-slate-300">Sin subtareas</p>
            )}
          </div>

          {showSubModal && (
            <SubtaskModal
              users={users}
              onClose={() => setShowSubModal(false)}
              onCreate={(opts) => {
                onAddSubtask(opts)
                setShowSubModal(false)
              }}
            />
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

// ─── SubtaskModal ─────────────────────────────────────────
function SubtaskModal({
  users, onClose, onCreate,
}: {
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
  onClose: () => void
  onCreate: (opts: { titulo: string; descripcion?: string; assigneeId?: string; fechaLimite?: string; prioridad?: string }) => void
}) {
  const [titulo,      setTitulo]      = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [assigneeId,  setAssigneeId]  = useState('')
  const [fechaLimite, setFechaLimite] = useState('')
  const [prioridad,   setPrioridad]   = useState('media')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function submit() {
    if (!titulo.trim()) return
    onCreate({ titulo: titulo.trim(), descripcion: descripcion.trim() || undefined, assigneeId: assigneeId || undefined, fechaLimite: fechaLimite || undefined, prioridad })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Nueva subtarea</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <input
            ref={inputRef}
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit(); if (e.key === 'Escape') onClose() }}
            placeholder="Nombre de la subtarea *"
            className="w-full text-sm font-medium text-slate-800 placeholder-slate-300 outline-none border-b border-slate-200 pb-2 focus:border-blue-400 transition-colors"
          />

          <textarea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            placeholder="Descripción (opcional)"
            rows={2}
            className="w-full text-sm text-slate-600 placeholder-slate-300 outline-none resize-none bg-slate-50 rounded-lg px-3 py-2 focus:bg-white focus:ring-1 focus:ring-blue-200 transition-all"
          />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1">Asignado a</label>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-600">
                <option value="">Sin asignar</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1">Fecha límite</label>
              <input type="date" value={fechaLimite} onChange={e => setFechaLimite(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-600" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1">Prioridad</label>
              <select value={prioridad} onChange={e => setPrioridad(e.target.value)} className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-600">
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">Cancelar</button>
          <button onClick={submit} disabled={!titulo.trim()} className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            Crear subtarea
          </button>
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
