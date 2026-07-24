'use client'

import { useState, use, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft, Plus, Circle, CheckCircle2, FolderKanban,
  ExternalLink, GripVertical, LayoutDashboard, List, LayoutGrid, CalendarRange,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type { Project, TaskSection, ProjectTask, User } from '@/types'
import { TaskPanel, Avatar } from '@/components/projects/TaskPanel'
import { BoardView } from '@/components/projects/BoardView'
import { ResumenView } from '@/components/projects/ResumenView'
import { CronogramaView } from '@/components/projects/CronogramaView'

// ─── types ────────────────────────────────────────────────
interface ProjectDetail extends Project {
  sections?: (TaskSection & { tasks?: ProjectTask[] })[]
}
type ViewMode = 'resumen' | 'lista' | 'tablero' | 'cronograma'

const VIEWS: { id: ViewMode; label: string; icon: React.ElementType }[] = [
  { id: 'resumen',    label: 'Resumen',    icon: LayoutDashboard },
  { id: 'lista',      label: 'Lista',      icon: List            },
  { id: 'tablero',    label: 'Tablero',    icon: LayoutGrid      },
  { id: 'cronograma', label: 'Cronograma', icon: CalendarRange   },
]

// ─── API helpers ─────────────────────────────────────────
async function fetchProject(id: string): Promise<{ data: ProjectDetail }> {
  const r = await fetch(`/api/projects/${id}`)
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`)
  }
  return r.json()
}

async function fetchUsers(): Promise<{ data: Pick<User, 'id' | 'full_name' | 'avatar_url'>[] }> {
  const r = await fetch('/api/users')
  if (!r.ok) return { data: [] }
  return r.json()
}

async function apiPatchTask(taskId: string, updates: Record<string, unknown>) {
  const r = await fetch(`/api/project-tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error((j as { error?: string }).error ?? 'Error al actualizar')
  }
}

async function apiCreateTask(projectId: string, opts: {
  sectionId: string | null
  titulo: string
  parentTaskId?: string | null
}) {
  const r = await fetch(`/api/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titulo:         opts.titulo,
      section_id:     opts.sectionId,
      parent_task_id: opts.parentTaskId ?? null,
    }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error((j as { error?: string }).error ?? 'Error al crear tarea')
  return j as { data: ProjectTask }
}

async function apiCreateSection(projectId: string, nombre: string) {
  const r = await fetch(`/api/projects/${projectId}/sections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error((j as { error?: string }).error ?? 'Error al crear sección')
  return j
}

// ─── Status config ────────────────────────────────────────
const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente:     { label: 'Pendiente',     color: 'text-slate-600 bg-slate-100' },
  en_desarrollo: { label: 'En desarrollo', color: 'text-blue-700  bg-blue-50'   },
  en_revision:   { label: 'En revisión',   color: 'text-amber-700 bg-amber-50'  },
  en_pausa:      { label: 'En pausa',      color: 'text-red-700   bg-red-50'    },
  finalizado:    { label: 'Finalizado',    color: 'text-green-700 bg-green-50'  },
}

// ─── Page ─────────────────────────────────────────────────
export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const qc = useQueryClient()
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [activeTask, setActiveTask] = useState<ProjectTask | null>(null)
  const [view, setView] = useState<ViewMode>('lista')

  const { data, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id),
    staleTime: 30_000,
  })

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    staleTime: 300_000,
  })
  const users = usersData?.data ?? []

  // ── mutations ──────────────────────────────────────────
  const patchTask = useMutation({
    mutationFn: ({ taskId, updates }: { taskId: string; updates: Record<string, unknown> }) =>
      apiPatchTask(taskId, updates),
    onMutate: async ({ taskId, updates }) => {
      await qc.cancelQueries({ queryKey: ['project', id] })
      const prev = qc.getQueryData<{ data: ProjectDetail }>(['project', id])
      if (prev?.data.sections) {
        qc.setQueryData(['project', id], {
          ...prev,
          data: {
            ...prev.data,
            sections: prev.data.sections.map(s => ({
              ...s,
              tasks: s.tasks?.map(t => t.id === taskId ? { ...t, ...updates } : t),
            })),
          },
        })
      }
      return { prev }
    },
    onError: (_e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['project', id], ctx.prev)
      toast.error('Error al actualizar tarea')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  })

  const addTask = useMutation({
    mutationFn: (opts: { sectionId: string | null; titulo: string; parentTaskId?: string | null }) =>
      apiCreateTask(id, opts),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const addSection = useMutation({
    mutationFn: (nombre: string) => apiCreateSection(id, nombre),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
    onError: (e: Error) => toast.error(e.message),
  })

  // ── DnD ──────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    const task = (data?.data.sections ?? []).flatMap(s => s.tasks ?? []).find(t => t.id === active.id)
    setActiveTask(task ?? null)
  }, [data])

  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    setActiveTask(null)
    if (!over || active.id === over.id) return
    const sections = data?.data.sections ?? []
    const allTasks = sections.flatMap(s => s.tasks ?? [])
    const draggedTask = allTasks.find(t => t.id === active.id)
    if (!draggedTask) return

    const overTask    = allTasks.find(t => t.id === over.id)
    const overSection = sections.find(s => s.id === over.id)
    const targetSectionId = overSection?.id ?? overTask?.section_id ?? draggedTask.section_id

    if (targetSectionId !== draggedTask.section_id) {
      patchTask.mutate({ taskId: draggedTask.id, updates: { section_id: targetSectionId, position: 9999 } })
    } else {
      const sectionTasks = (sections.find(s => s.id === draggedTask.section_id)?.tasks ?? []).filter(t => !t.deleted_at)
      const oldIdx = sectionTasks.findIndex(t => t.id === draggedTask.id)
      const newIdx = sectionTasks.findIndex(t => t.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return
      const reordered = arrayMove(sectionTasks, oldIdx, newIdx)
      const prev = reordered[newIdx - 1]?.position ?? 0
      const next = reordered[newIdx + 1]?.position ?? prev + 2
      patchTask.mutate({ taskId: draggedTask.id, updates: { position: (prev + next) / 2 } })
    }
  }, [data, patchTask])

  // ── data ─────────────────────────────────────────────
  const sections  = data?.data.sections ?? []
  const allTasks  = sections.flatMap(s => s.tasks ?? [])
  const selectedTask = selectedTaskId ? allTasks.find(t => t.id === selectedTaskId) ?? null : null

  const allActiveTasks = allTasks.filter(t => !t.deleted_at && !t.parent_task_id)
  const totalTasks = allActiveTasks.length
  const doneTasks  = allActiveTasks.filter(t => t.estado === 'finalizada').length
  const progress   = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  // ── render ───────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-white">
          <div className="h-6 w-48 bg-slate-100 rounded animate-pulse" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-slate-500">{(error as Error)?.message || 'Proyecto no encontrado'}</p>
        <Link href="/projects" className="text-blue-600 text-sm">← Volver a proyectos</Link>
      </div>
    )
  }

  const project = data.data
  const estadoConfig = ESTADO_CONFIG[project.estado] ?? ESTADO_CONFIG.pendiente
  const client = project.lead?.empresa || [project.lead?.nombre, project.lead?.apellido].filter(Boolean).join(' ')

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full overflow-hidden">

        {/* ── Main ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Header */}
          <div className="px-6 pt-4 pb-0 border-b bg-white flex-shrink-0">
            {/* Top row */}
            <div className="flex items-center gap-3 mb-2">
              <Link href="/projects" className="text-slate-400 hover:text-slate-700 transition-colors">
                <ArrowLeft size={18} />
              </Link>
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: project.color }} />
              <h1 className="text-lg font-semibold text-slate-900 flex-1 min-w-0 truncate">{project.nombre}</h1>
              <span className={cn('px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap', estadoConfig.color)}>
                {estadoConfig.label}
              </span>
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap pl-9 mb-2">
              {client && (
                <span className="flex items-center gap-1.5">
                  <FolderKanban size={13} />
                  {project.lead_id
                    ? <Link href={`/leads?lead=${project.lead_id}`} className="hover:text-blue-600 flex items-center gap-1">{client} <ExternalLink size={11} /></Link>
                    : client}
                </span>
              )}
              {project.fecha_fin && (
                <span>Entrega: {format(new Date(project.fecha_fin), 'd MMM yyyy', { locale: es })}</span>
              )}
              {totalTasks > 0 && (
                <span className="flex items-center gap-2">
                  <span className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden inline-block">
                    <span className="block h-full bg-green-500 rounded-full" style={{ width: `${progress}%` }} />
                  </span>
                  <span className="text-xs text-slate-400">{doneTasks}/{totalTasks}</span>
                </span>
              )}
            </div>

            {/* View tabs — Asana style */}
            <div className="flex items-center gap-0 pl-7">
              {VIEWS.map(v => {
                const Icon = v.icon
                const active = view === v.id
                return (
                  <button
                    key={v.id}
                    onClick={() => setView(v.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                      active
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    )}
                  >
                    <Icon size={14} />
                    {v.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Content area */}
          {view === 'resumen' && (
            <ResumenView project={project} users={users} />
          )}

          {view === 'lista' && (
            <div className="flex-1 overflow-auto p-6 space-y-6">
              {sections
                .sort((a, b) => a.position - b.position)
                .map(section => (
                  <SectionBlock
                    key={section.id}
                    section={section}
                    allTasks={allTasks}
                    selectedTaskId={selectedTaskId}
                    users={users}
                    onSelectTask={setSelectedTaskId}
                    onToggleTask={(taskId, isDone) =>
                      patchTask.mutate({ taskId, updates: { estado: isDone ? 'finalizada' : 'pendiente' } })
                    }
                    onAddTask={(titulo) => addTask.mutate({ sectionId: section.id, titulo })}
                    isAddingTask={addTask.isPending}
                  />
                ))}
              <AddSectionRow onAdd={(n) => addSection.mutate(n)} isAdding={addSection.isPending} />
            </div>
          )}

          {view === 'tablero' && (
            <BoardView
              sections={sections}
              selectedTaskId={selectedTaskId}
              users={users}
              onSelectTask={setSelectedTaskId}
              onToggleTask={(taskId, isDone) =>
                patchTask.mutate({ taskId, updates: { estado: isDone ? 'finalizada' : 'pendiente' } })
              }
              onAddTask={(sectionId, titulo) => addTask.mutate({ sectionId, titulo })}
            />
          )}

          {view === 'cronograma' && (
            <CronogramaView
              sections={sections}
              users={users}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
            />
          )}
        </div>

        {/* ── Task panel ── */}
        {selectedTask && (
          <div className="w-80 xl:w-96 flex-shrink-0 overflow-hidden flex flex-col border-l">
            <TaskPanel
              key={selectedTask.id}
              task={selectedTask}
              sections={sections}
              allTasks={allTasks}
              users={users}
              projectId={id}
              onClose={() => setSelectedTaskId(null)}
              onUpdate={(updates) =>
                patchTask.mutate({ taskId: selectedTask.id, updates: updates as Record<string, unknown> })
              }
              onAddSubtask={(titulo) =>
                addTask.mutate({ sectionId: selectedTask.section_id, titulo, parentTaskId: selectedTask.id })
              }
              onToggleTask={(taskId, isDone) =>
                patchTask.mutate({ taskId, updates: { estado: isDone ? 'finalizada' : 'pendiente' } })
              }
            />
          </div>
        )}
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeTask && (
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 shadow-lg text-sm text-slate-700">
            {activeTask.titulo}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

// ─── SectionBlock ─────────────────────────────────────────
function SectionBlock({
  section, allTasks, selectedTaskId, users,
  onSelectTask, onToggleTask, onAddTask, isAddingTask,
}: {
  section: TaskSection & { tasks?: ProjectTask[] }
  allTasks: ProjectTask[]
  selectedTaskId: string | null
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
  onSelectTask: (id: string) => void
  onToggleTask: (id: string, isDone: boolean) => void
  onAddTask: (titulo: string) => void
  isAddingTask: boolean
}) {
  const [inputVisible, setInputVisible] = useState(false)
  const [inputVal, setInputVal] = useState('')

  const tasks = (section.tasks ?? [])
    .filter(t => !t.deleted_at && !t.parent_task_id)
    .sort((a, b) => a.position - b.position)
  const taskIds = tasks.map(t => t.id)

  function submit() {
    const t = inputVal.trim()
    if (!t) return
    onAddTask(t)
    setInputVal('')
    setInputVisible(false)
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full" style={{ background: section.color ?? '#94A3B8' }} />
        <span className="text-sm font-semibold text-slate-700">{section.nombre}</span>
        <span className="text-xs text-slate-400">({tasks.length})</span>
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1 mb-2">
          {tasks.map(task => {
            const subtaskCount = allTasks.filter(t => t.parent_task_id === task.id && !t.deleted_at).length
            const subtaskDone  = allTasks.filter(t => t.parent_task_id === task.id && !t.deleted_at && t.estado === 'finalizada').length
            return (
              <SortableTaskRow
                key={task.id}
                task={task}
                isSelected={selectedTaskId === task.id}
                subtaskCount={subtaskCount}
                subtaskDone={subtaskDone}
                users={users}
                onToggle={(isDone) => onToggleTask(task.id, isDone)}
                onClick={() => onSelectTask(task.id)}
              />
            )
          })}
          {tasks.length === 0 && !inputVisible && (
            <div className="text-xs text-slate-300 px-1 py-1">Sin tareas</div>
          )}
        </div>
      </SortableContext>

      {inputVisible ? (
        <div className="flex items-center gap-2 bg-white border border-blue-300 rounded-lg px-3 py-2">
          <input
            autoFocus
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') { setInputVisible(false); setInputVal('') }
            }}
            placeholder="Nombre de la tarea"
            className="flex-1 text-sm outline-none"
          />
          <button onClick={submit} disabled={!inputVal.trim() || isAddingTask} className="text-sm font-medium text-blue-600 disabled:opacity-50">Agregar</button>
          <button onClick={() => { setInputVisible(false); setInputVal('') }} className="text-sm text-slate-400">✕</button>
        </div>
      ) : (
        <button onClick={() => setInputVisible(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1 px-1">
          <Plus size={12} /> Agregar tarea
        </button>
      )}
    </div>
  )
}

// ─── SortableTaskRow ──────────────────────────────────────
function SortableTaskRow({
  task, isSelected, subtaskCount, subtaskDone, users, onToggle, onClick,
}: {
  task: ProjectTask
  isSelected: boolean
  subtaskCount: number
  subtaskDone: number
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
  onToggle: (isDone: boolean) => void
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }

  const isDone    = task.estado === 'finalizada'
  const isOverdue = task.fecha_limite && !isDone && new Date(task.fecha_limite) < new Date()
  const assignee  = task.assignee_id ? users.find(u => u.id === task.assignee_id) : null

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors group border',
        isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:border-slate-200'
      )}
      onClick={onClick}
    >
      <span {...attributes} {...listeners} className="flex-shrink-0 text-slate-200 hover:text-slate-400 cursor-grab active:cursor-grabbing" onClick={e => e.stopPropagation()}>
        <GripVertical size={13} />
      </span>

      <button
        onClick={e => { e.stopPropagation(); onToggle(!isDone) }}
        className={cn('flex-shrink-0 transition-colors', isDone ? 'text-green-500' : 'text-slate-300 hover:text-green-500')}
      >
        {isDone ? <CheckCircle2 size={15} /> : <Circle size={15} />}
      </button>

      <span className={cn('text-sm flex-1 min-w-0 truncate', isDone ? 'line-through text-slate-400' : 'text-slate-700')}>
        {task.titulo}
      </span>

      {subtaskCount > 0 && (
        <span className="text-[10px] text-slate-400 whitespace-nowrap hidden sm:block">
          {subtaskDone}/{subtaskCount}
        </span>
      )}

      {task.fecha_limite && (
        <span className={cn('text-xs whitespace-nowrap hidden sm:block', isOverdue ? 'text-red-500 font-medium' : 'text-slate-400')}>
          {format(new Date(task.fecha_limite), 'd MMM', { locale: es })}
        </span>
      )}

      {assignee && <Avatar name={assignee.full_name} url={assignee.avatar_url} size={20} />}

      {task.prioridad && task.prioridad !== 'media' && (
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0',
          task.prioridad === 'urgente' ? 'bg-red-500' :
          task.prioridad === 'alta'    ? 'bg-amber-500' : 'bg-slate-300'
        )} />
      )}
    </div>
  )
}

// ─── AddSectionRow ────────────────────────────────────────
function AddSectionRow({ onAdd, isAdding }: { onAdd: (n: string) => void; isAdding: boolean }) {
  const [visible, setVisible] = useState(false)
  const [val, setVal] = useState('')

  function submit() {
    const n = val.trim()
    if (!n) return
    onAdd(n)
    setVal('')
    setVisible(false)
  }

  if (visible) {
    return (
      <div className="flex items-center gap-2 border-t pt-4">
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') { setVisible(false); setVal('') }
          }}
          placeholder="Nombre de la sección"
          className="flex-1 text-sm border border-blue-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button onClick={submit} disabled={!val.trim() || isAdding} className="text-sm font-medium text-blue-600 disabled:opacity-50">Crear</button>
        <button onClick={() => { setVisible(false); setVal('') }} className="text-sm text-slate-400">✕</button>
      </div>
    )
  }

  return (
    <div className="border-t pt-4">
      <button onClick={() => setVisible(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1">
        <Plus size={12} /> Agregar sección
      </button>
    </div>
  )
}
