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
  ArrowLeft, Plus, Circle, CheckCircle2, FolderKanban, ExternalLink,
  GripVertical, LayoutDashboard, List, LayoutGrid, CalendarRange, ChevronRight,
  ChevronDown, Check, SlidersHorizontal, X, UserPlus, Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type { Project, TaskSection, ProjectTask, ProjectEstado, User } from '@/types'
import { TaskPanel, Avatar } from '@/components/projects/TaskPanel'
import { BoardView } from '@/components/projects/BoardView'
import { ResumenView } from '@/components/projects/ResumenView'
import { CronogramaView } from '@/components/projects/CronogramaView'

// ─── types ────────────────────────────────────────────────
interface ProjectDetail extends Project {
  sections?: (TaskSection & { tasks?: ProjectTask[] })[]
}
type ViewMode = 'resumen' | 'lista' | 'tablero' | 'cronograma'

interface Filters {
  assigneeId: string
  priority:   string
  taskStatus: string
}

const EMPTY_FILTERS: Filters = { assigneeId: '', priority: '', taskStatus: '' }

const VIEWS: { id: ViewMode; label: string; icon: React.ElementType }[] = [
  { id: 'resumen',    label: 'Resumen',    icon: LayoutDashboard },
  { id: 'lista',      label: 'Lista',      icon: List            },
  { id: 'tablero',    label: 'Tablero',    icon: LayoutGrid      },
  { id: 'cronograma', label: 'Cronograma', icon: CalendarRange   },
]

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente:     { label: 'Pendiente',     color: 'text-slate-600 bg-slate-100 hover:bg-slate-200' },
  en_desarrollo: { label: 'En desarrollo', color: 'text-blue-700  bg-blue-50   hover:bg-blue-100'  },
  en_revision:   { label: 'En revisión',   color: 'text-amber-700 bg-amber-50  hover:bg-amber-100' },
  en_pausa:      { label: 'En pausa',      color: 'text-orange-700 bg-orange-50 hover:bg-orange-100' },
  finalizado:    { label: 'Finalizado',    color: 'text-green-700 bg-green-50  hover:bg-green-100' },
}

const PRIORITY_OPTS = [
  { value: 'baja',    label: 'Baja'    },
  { value: 'media',   label: 'Media'   },
  { value: 'alta',    label: 'Alta'    },
  { value: 'urgente', label: 'Urgente' },
]

const TASK_STATUS_OPTS = [
  { value: 'pendiente',   label: 'Pendiente'   },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'bloqueada',   label: 'Bloqueada'   },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'finalizada',  label: 'Finalizada'  },
  { value: 'cancelada',   label: 'Cancelada'   },
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

async function apiPatchProject(id: string, updates: Record<string, unknown>) {
  const r = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error((j as { error?: string }).error ?? 'Error al actualizar proyecto')
  }
}

async function apiCreateTask(projectId: string, opts: {
  sectionId: string | null
  titulo: string
  descripcion?: string
  assigneeId?: string
  fechaLimite?: string
  prioridad?: string
  parentTaskId?: string | null
}) {
  const r = await fetch(`/api/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      titulo:         opts.titulo,
      section_id:     opts.sectionId,
      parent_task_id: opts.parentTaskId ?? null,
      descripcion:    opts.descripcion   || null,
      assignee_id:    opts.assigneeId    || null,
      fecha_limite:   opts.fechaLimite   || null,
      prioridad:      opts.prioridad     || 'media',
    }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error((j as { error?: string }).error ?? 'Error al crear tarea')
  return j as { data: ProjectTask }
}

async function apiPatchSection(sectionId: string, updates: Record<string, unknown>) {
  const r = await fetch(`/api/project-sections/${sectionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  const j = await r.json()
  if (!r.ok) throw new Error((j as { error?: string }).error ?? 'Error al actualizar sección')
  return j
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

function getDescendants(tasks: ProjectTask[], taskId: string): ProjectTask[] {
  const direct = tasks.filter(t => t.parent_task_id === taskId && !t.deleted_at)
  return direct.flatMap(child => [child, ...getDescendants(tasks, child.id)])
}

// ─── Page ─────────────────────────────────────────────────
export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const qc = useQueryClient()

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [activeTask,     setActiveTask]     = useState<ProjectTask | null>(null)
  const [activeSection,  setActiveSection]  = useState<(TaskSection & { tasks?: ProjectTask[] }) | null>(null)
  const [view,           setView]           = useState<ViewMode>('lista')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [filters,        setFilters]        = useState<Filters>(EMPTY_FILTERS)
  const [newTaskModal,   setNewTaskModal]   = useState<{ sectionId: string } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id),
    staleTime: 30_000,
  })

  const { data: meData } = useQuery({
    queryKey: ['auth-me'],
    queryFn:  () => fetch('/api/auth/me').then(r => r.json()),
    staleTime: 300_000,
  })
  const meRole = (meData?.data?.role ?? '') as string

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

  const patchProject = useMutation({
    mutationFn: (updates: Record<string, unknown>) => apiPatchProject(id, updates),
    onMutate: async (updates) => {
      await qc.cancelQueries({ queryKey: ['project', id] })
      const prev = qc.getQueryData<{ data: ProjectDetail }>(['project', id])
      if (prev) {
        qc.setQueryData(['project', id], {
          ...prev,
          data: { ...prev.data, ...updates },
        })
      }
      return { prev }
    },
    onError: (_e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['project', id], ctx.prev)
      toast.error('Error al actualizar proyecto')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['project', id] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  const addTask = useMutation({
    mutationFn: (opts: { sectionId: string | null; titulo: string; descripcion?: string; assigneeId?: string; fechaLimite?: string; prioridad?: string; parentTaskId?: string | null }) =>
      apiCreateTask(id, opts),
    onSuccess: (res, variables) => {
      qc.invalidateQueries({ queryKey: ['project', id] })
      // For subtasks, stay on the parent task; only auto-open panel for root tasks
      if (res.data?.id && !variables.parentTaskId) setSelectedTaskId(res.data.id)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const addSection = useMutation({
    mutationFn: (nombre: string) => apiCreateSection(id, nombre),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const patchSection = useMutation({
    mutationFn: ({ sectionId, updates }: { sectionId: string; updates: Record<string, unknown> }) =>
      apiPatchSection(sectionId, updates),
    onMutate: async ({ sectionId, updates }) => {
      await qc.cancelQueries({ queryKey: ['project', id] })
      const prev = qc.getQueryData<{ data: ProjectDetail }>(['project', id])
      if (prev?.data.sections) {
        qc.setQueryData(['project', id], {
          ...prev,
          data: {
            ...prev.data,
            sections: prev.data.sections.map(s => s.id === sectionId ? { ...s, ...updates } : s),
          },
        })
      }
      return { prev }
    },
    onError: (_e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['project', id], ctx.prev)
      toast.error('Error al mover sección')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  })

  const deleteTask = useMutation({
    mutationFn: (taskId: string) =>
      fetch(`/api/project-tasks/${taskId}`, { method: 'DELETE' }).then(r => r.json()),
    onMutate: async (taskId) => {
      await qc.cancelQueries({ queryKey: ['project', id] })
      const prev = qc.getQueryData<{ data: ProjectDetail }>(['project', id])
      if (prev?.data.sections) {
        qc.setQueryData(['project', id], {
          ...prev,
          data: {
            ...prev.data,
            sections: prev.data.sections.map(s => ({
              ...s,
              tasks: s.tasks?.map(t => t.id === taskId ? { ...t, deleted_at: new Date().toISOString() } : t),
            })),
          },
        })
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['project', id], ctx.prev)
      toast.error('Error al eliminar tarea')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['project', id] }),
    onSuccess: () => toast.success('Tarea eliminada'),
  })

  // ── DnD ──────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    const allSections = data?.data.sections ?? []
    const task = allSections.flatMap(s => s.tasks ?? []).find(t => t.id === active.id)
    if (task) {
      setActiveTask(task)
      setActiveSection(null)
    } else {
      setActiveSection(allSections.find(s => s.id === active.id) ?? null)
      setActiveTask(null)
    }
  }, [data])

  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    setActiveTask(null)
    setActiveSection(null)
    if (!over || active.id === over.id) return
    const sections = data?.data.sections ?? []

    // ── Section reorder ──
    const draggedSection = sections.find(s => s.id === active.id)
    if (draggedSection) {
      const overSection = sections.find(s => s.id === over.id)
      if (!overSection) return
      const sorted = [...sections].sort((a, b) => a.position - b.position)
      const oldIdx = sorted.findIndex(s => s.id === draggedSection.id)
      const newIdx = sorted.findIndex(s => s.id === overSection.id)
      if (oldIdx === -1 || newIdx === -1) return
      const reordered = arrayMove(sorted, oldIdx, newIdx)
      const prev = reordered[newIdx - 1]?.position ?? 0
      const next = reordered[newIdx + 1]?.position ?? prev + 2
      patchSection.mutate({ sectionId: draggedSection.id, updates: { position: (prev + next) / 2 } })
      return
    }

    // ── Task reorder ──
    const allTasksFlat = sections.flatMap(s => s.tasks ?? [])
    const draggedTask = allTasksFlat.find(t => t.id === active.id)
    if (!draggedTask) return

    // Subtask reorder — stays within same parent
    if (draggedTask.parent_task_id) {
      const siblings = allTasksFlat
        .filter(t => t.parent_task_id === draggedTask.parent_task_id && !t.deleted_at)
        .sort((a, b) => a.position - b.position)
      const oldIdx = siblings.findIndex(t => t.id === draggedTask.id)
      const newIdx = siblings.findIndex(t => t.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return
      const reordered = arrayMove(siblings, oldIdx, newIdx)
      const prev = reordered[newIdx - 1]?.position ?? 0
      const next = reordered[newIdx + 1]?.position ?? prev + 2
      patchTask.mutate({ taskId: draggedTask.id, updates: { position: (prev + next) / 2 } })
      return
    }

    const overTask    = allTasksFlat.find(t => t.id === over.id)
    const overSection = sections.find(s => s.id === over.id)
    const targetSectionId = overSection?.id ?? overTask?.section_id ?? draggedTask.section_id

    if (targetSectionId !== draggedTask.section_id) {
      patchTask.mutate({ taskId: draggedTask.id, updates: { section_id: targetSectionId, position: 9999 } })
      getDescendants(allTasksFlat, draggedTask.id).forEach(t => {
        patchTask.mutate({ taskId: t.id, updates: { section_id: targetSectionId, position: 9999 } })
      })
    } else {
      const sectionTasks = (sections.find(s => s.id === draggedTask.section_id)?.tasks ?? [])
        .filter(t => !t.deleted_at && !t.parent_task_id)
      const oldIdx = sectionTasks.findIndex(t => t.id === draggedTask.id)
      const newIdx = sectionTasks.findIndex(t => t.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return
      const reordered = arrayMove(sectionTasks, oldIdx, newIdx)
      const prev = reordered[newIdx - 1]?.position ?? 0
      const next = reordered[newIdx + 1]?.position ?? prev + 2
      patchTask.mutate({ taskId: draggedTask.id, updates: { position: (prev + next) / 2 } })
    }
  }, [data, patchTask, patchSection])

  // ── data ─────────────────────────────────────────────
  const sections = data?.data.sections ?? []
  const allTasks = sections.flatMap(s => s.tasks ?? [])  // unfiltered — for TaskPanel subtasks

  const handleToggleTask = useCallback((taskId: string, isDone: boolean) => {
    const estado  = isDone ? 'finalizada' : 'pendiente'
    const doneSection    = sections.find(s => s.is_done)
    const task           = allTasks.find(t => t.id === taskId)
    const updates: Record<string, unknown> = { estado }

    // Move to/from the "done" section automatically (only root tasks)
    if (task && !task.parent_task_id) {
      if (isDone && doneSection && task.section_id !== doneSection.id) {
        updates.section_id = doneSection.id
        updates.position   = 9999
      } else if (!isDone && task.section_id === doneSection?.id) {
        // Move back to first non-done section if still sitting in the done column
        const fallback = sections.find(s => !s.is_done)
        if (fallback) { updates.section_id = fallback.id; updates.position = 9999 }
      }
    }

    patchTask.mutate({ taskId, updates })
    if (isDone) {
      getDescendants(allTasks, taskId).forEach(t => {
        if (t.estado !== 'finalizada') {
          const childUpdates: Record<string, unknown> = { estado: 'finalizada' }
          if (updates.section_id) childUpdates.section_id = updates.section_id
          patchTask.mutate({ taskId: t.id, updates: childUpdates })
        }
      })
    }
  }, [allTasks, sections, patchTask])

  const hasFilters = !!(filters.assigneeId || filters.priority || filters.taskStatus)
  const activeFilterCount = [filters.assigneeId, filters.priority, filters.taskStatus].filter(Boolean).length

  const filteredSections = sections.map(s => ({
    ...s,
    tasks: (s.tasks ?? []).filter(t => {
      if (t.deleted_at) return false
      if (t.parent_task_id) return true  // always keep subtasks; SectionBlock hides them
      if (filters.assigneeId && t.assignee_id !== filters.assigneeId) return false
      if (filters.priority   && t.prioridad    !== filters.priority)   return false
      if (filters.taskStatus && t.estado       !== filters.taskStatus) return false
      return true
    }),
  }))

  const selectedTask   = selectedTaskId ? allTasks.find(t => t.id === selectedTaskId) ?? null : null
  const allActiveTasks = allTasks.filter(t => !t.deleted_at && !t.parent_task_id)
  const totalTasks     = allActiveTasks.length
  const doneTasks      = allActiveTasks.filter(t => t.estado === 'finalizada').length
  const progress       = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

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

  const project      = data.data
  const estadoConfig = ESTADO_CONFIG[project.estado] ?? ESTADO_CONFIG.pendiente
  const client       = project.lead?.empresa || [project.lead?.nombre, project.lead?.apellido].filter(Boolean).join(' ')

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
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: project.color ?? '#6366f1' }} />
              <h1 className="text-lg font-semibold text-slate-900 flex-1 min-w-0 truncate">{project.nombre}</h1>

              {/* Status badge — clickable dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowStatusMenu(v => !v)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                    estadoConfig.color
                  )}
                >
                  {estadoConfig.label}
                  <ChevronDown size={11} />
                </button>

                {showStatusMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowStatusMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1.5 min-w-[170px]">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider px-3 py-1">Estado del proyecto</p>
                      {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
                        <button
                          key={key}
                          onClick={() => {
                            patchProject.mutate({ estado: key as ProjectEstado })
                            setShowStatusMenu(false)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors"
                        >
                          <span className={cn('flex-1 text-left text-xs font-medium px-2 py-0.5 rounded-full', cfg.color.replace('hover:bg-\\S+', ''))}>
                            {cfg.label}
                          </span>
                          {project.estado === key && <Check size={12} className="text-blue-600 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
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

            {/* Members button (admin/sales only) */}
            {['admin', 'sales'].includes(meRole) && (
              <div className="pl-9 mb-1.5">
                <ProjectMembersMenu projectId={id} users={users} />
              </div>
            )}

            {/* View tabs */}
            <div className="flex items-center justify-between pl-7">
              <div className="flex items-center gap-0">
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

              {/* Filter toggle (only for task views) */}
              {view !== 'resumen' && (
                <div className="flex items-center gap-2 pb-1">
                  <FilterBar
                    filters={filters}
                    users={users}
                    onChange={setFilters}
                    activeCount={activeFilterCount}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Active filter chips */}
          {hasFilters && view !== 'resumen' && (
            <div className="flex items-center gap-2 px-6 py-2 bg-blue-50 border-b border-blue-100 flex-wrap">
              <span className="text-xs text-blue-600 font-medium">Filtros activos:</span>
              {filters.assigneeId && (
                <FilterChip
                  label={users.find(u => u.id === filters.assigneeId)?.full_name ?? 'Usuario'}
                  onRemove={() => setFilters(f => ({ ...f, assigneeId: '' }))}
                />
              )}
              {filters.priority && (
                <FilterChip
                  label={PRIORITY_OPTS.find(o => o.value === filters.priority)?.label ?? filters.priority}
                  onRemove={() => setFilters(f => ({ ...f, priority: '' }))}
                />
              )}
              {filters.taskStatus && (
                <FilterChip
                  label={TASK_STATUS_OPTS.find(o => o.value === filters.taskStatus)?.label ?? filters.taskStatus}
                  onRemove={() => setFilters(f => ({ ...f, taskStatus: '' }))}
                />
              )}
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-blue-500 hover:text-blue-700 ml-1">
                Limpiar todo
              </button>
            </div>
          )}

          {/* Content */}
          {view === 'resumen' && (
            <ResumenView project={project} users={users} />
          )}

          {view === 'lista' && (
            <div className="flex-1 overflow-auto p-6 space-y-6">
              <SortableContext
                items={filteredSections.sort((a, b) => a.position - b.position).map(s => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredSections
                  .sort((a, b) => a.position - b.position)
                  .map(section => (
                    <SectionBlock
                      key={section.id}
                      section={section}
                      allTasks={allTasks}
                      selectedTaskId={selectedTaskId}
                      users={users}
                      onSelectTask={setSelectedTaskId}
                      onToggleTask={handleToggleTask}
                      onAddTask={() => setNewTaskModal({ sectionId: section.id })}
                      onDeleteTask={(taskId) => deleteTask.mutate(taskId)}
                      isAddingTask={addTask.isPending}
                    />
                  ))}
              </SortableContext>
              <AddSectionRow onAdd={(n) => addSection.mutate(n)} isAdding={addSection.isPending} />
            </div>
          )}

          {view === 'tablero' && (
            <BoardView
              sections={filteredSections}
              selectedTaskId={selectedTaskId}
              users={users}
              onSelectTask={setSelectedTaskId}
              onToggleTask={handleToggleTask}
              onAddTask={(sectionId) => setNewTaskModal({ sectionId })}
            />
          )}

          {view === 'cronograma' && (
            <CronogramaView
              sections={filteredSections}
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
              onAddSubtask={(opts) =>
                addTask.mutate({ sectionId: selectedTask.section_id, ...opts, parentTaskId: selectedTask.id })
              }
              onToggleTask={handleToggleTask}
            />
          </div>
        )}
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 shadow-lg text-sm text-slate-700">
            {activeTask.titulo}
          </div>
        )}
        {activeSection && (
          <div className="bg-white border border-slate-300 rounded-lg px-3 py-2 shadow-lg text-sm font-semibold text-slate-700 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: activeSection.color ?? '#94A3B8' }} />
            {activeSection.nombre}
          </div>
        )}
      </DragOverlay>

      {newTaskModal && (
        <NewTaskModal
          users={users}
          isPending={addTask.isPending}
          onClose={() => setNewTaskModal(null)}
          onCreate={(opts) => {
            addTask.mutate({ sectionId: newTaskModal.sectionId, ...opts })
            setNewTaskModal(null)
          }}
        />
      )}
    </DndContext>
  )
}

// ─── FilterBar ────────────────────────────────────────────
function FilterBar({
  filters, users, onChange, activeCount,
}: {
  filters: Filters
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
  onChange: (f: Filters) => void
  activeCount: number
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors',
          activeCount > 0
            ? 'bg-blue-50 border-blue-300 text-blue-700'
            : 'border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300'
        )}
      >
        <SlidersHorizontal size={12} />
        Filtrar
        {activeCount > 0 && (
          <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-4 w-64 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">Filtros</span>
              {activeCount > 0 && (
                <button onClick={() => { onChange(EMPTY_FILTERS); setOpen(false) }} className="text-xs text-blue-600 hover:text-blue-700">
                  Limpiar
                </button>
              )}
            </div>

            {/* Assignee */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Responsable</label>
              <select
                value={filters.assigneeId}
                onChange={e => onChange({ ...filters, assigneeId: e.target.value })}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">Todos</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Prioridad</label>
              <select
                value={filters.priority}
                onChange={e => onChange({ ...filters, priority: e.target.value })}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">Todas</option>
                {PRIORITY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Task status */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Estado de tarea</label>
              <select
                value={filters.taskStatus}
                onChange={e => onChange({ ...filters, taskStatus: e.target.value })}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">Todos</option>
                {TASK_STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── FilterChip ───────────────────────────────────────────
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
      {label}
      <button onClick={onRemove} className="hover:text-blue-900 ml-0.5">
        <X size={10} />
      </button>
    </span>
  )
}

// ─── NewTaskModal ─────────────────────────────────────────
function NewTaskModal({
  users, isPending, onClose, onCreate,
}: {
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
  isPending: boolean
  onClose: () => void
  onCreate: (opts: { titulo: string; descripcion?: string; assigneeId?: string; fechaLimite?: string; prioridad?: string }) => void
}) {
  const [titulo,      setTitulo]      = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [assigneeId,  setAssigneeId]  = useState('')
  const [fechaLimite, setFechaLimite] = useState('')
  const [prioridad,   setPrioridad]   = useState('media')

  function submit() {
    if (!titulo.trim()) return
    onCreate({ titulo: titulo.trim(), descripcion: descripcion.trim() || undefined, assigneeId: assigneeId || undefined, fechaLimite: fechaLimite || undefined, prioridad })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Nueva tarea</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Título */}
          <div>
            <input
              autoFocus
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit() }}
              placeholder="Nombre de la tarea *"
              className="w-full text-sm font-medium text-slate-800 placeholder-slate-300 outline-none border-b border-slate-200 pb-2 focus:border-blue-400 transition-colors"
            />
          </div>

          {/* Descripción */}
          <div>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Descripción (opcional)"
              rows={3}
              className="w-full text-sm text-slate-600 placeholder-slate-300 outline-none resize-none bg-slate-50 rounded-lg px-3 py-2.5 focus:bg-white focus:ring-1 focus:ring-blue-200 transition-all"
            />
          </div>

          {/* Row: asignado + fecha + prioridad */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1">Asignado a</label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-600"
              >
                <option value="">Sin asignar</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1">Fecha límite</label>
              <input
                type="date"
                value={fechaLimite}
                onChange={e => setFechaLimite(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-600"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1">Prioridad</label>
              <select
                value={prioridad}
                onChange={e => setPrioridad(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-600"
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!titulo.trim() || isPending}
            className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Creando...' : 'Crear tarea'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── SectionBlock ─────────────────────────────────────────
function SectionBlock({
  section, allTasks, selectedTaskId, users,
  onSelectTask, onToggleTask, onAddTask, onDeleteTask, isAddingTask,
}: {
  section: TaskSection & { tasks?: ProjectTask[] }
  allTasks: ProjectTask[]
  selectedTaskId: string | null
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
  onSelectTask: (id: string) => void
  onToggleTask: (id: string, isDone: boolean) => void
  onAddTask: () => void
  onDeleteTask: (id: string) => void
  isAddingTask: boolean
}) {
  const rootTasks = (section.tasks ?? []).filter(t => !t.deleted_at && !t.parent_task_id).sort((a, b) => a.position - b.position)
  const taskIds   = rootTasks.map(t => t.id)

  const getChildren = (parentId: string) =>
    allTasks.filter(t => t.parent_task_id === parentId && !t.deleted_at).sort((a, b) => a.position - b.position)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 mb-2 group">
        <button
          {...attributes}
          {...listeners}
          className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          tabIndex={-1}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="w-2 h-2 rounded-full" style={{ background: section.color ?? '#94A3B8' }} />
        <span className="text-sm font-semibold text-slate-700">{section.nombre}</span>
        <span className="text-xs text-slate-400">({rootTasks.length})</span>
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1 mb-2">
          {rootTasks.map(task => {
            const children = getChildren(task.id)
            const subtaskDone = children.filter(t => t.estado === 'finalizada').length
            return (
              <div key={task.id}>
                <SortableTaskRow
                  task={task}
                  isSelected={selectedTaskId === task.id}
                  subtaskCount={children.length}
                  subtaskDone={subtaskDone}
                  users={users}
                  onToggle={(isDone) => onToggleTask(task.id, isDone)}
                  onClick={() => onSelectTask(task.id)}
                  onDelete={() => onDeleteTask(task.id)}
                />
                {/* Level-1 subtasks */}
                <SortableContext items={children.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="ml-7 mt-1 space-y-1">
                    {children.map(sub => {
                      const grandchildren = getChildren(sub.id)
                      return (
                        <div key={sub.id}>
                          <SortableSubtaskRow
                            task={sub}
                            isSelected={selectedTaskId === sub.id}
                            users={users}
                            onToggle={(isDone) => onToggleTask(sub.id, isDone)}
                            onClick={() => onSelectTask(sub.id)}
                          />
                          {/* Level-2 subtasks */}
                          <SortableContext items={grandchildren.map(gc => gc.id)} strategy={verticalListSortingStrategy}>
                            <div className="ml-7 mt-1 space-y-1">
                              {grandchildren.map(sub2 => (
                                <SortableSubtaskRow
                                  key={sub2.id}
                                  task={sub2}
                                  isSelected={selectedTaskId === sub2.id}
                                  users={users}
                                  onToggle={(isDone) => onToggleTask(sub2.id, isDone)}
                                  onClick={() => onSelectTask(sub2.id)}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </div>
                      )
                    })}
                  </div>
                </SortableContext>
              </div>
            )
          })}
          {rootTasks.length === 0 && (
            <div className="text-xs text-slate-300 px-1 py-1">Sin tareas</div>
          )}
        </div>
      </SortableContext>

      <button
        onClick={onAddTask}
        disabled={isAddingTask}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1 px-1"
      >
        <Plus size={12} /> Agregar tarea
      </button>
    </div>
  )
}

// ─── SortableSubtaskRow ───────────────────────────────────
function SortableSubtaskRow({
  task, isSelected, users, onToggle, onClick,
}: {
  task: ProjectTask
  isSelected: boolean
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
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors group border',
        isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-100 hover:border-slate-200'
      )}
    >
      <span
        {...attributes}
        {...listeners}
        className="flex-shrink-0 text-slate-200 hover:text-slate-400 cursor-grab active:cursor-grabbing"
        onClick={e => e.stopPropagation()}
      >
        <GripVertical size={11} />
      </span>
      <button
        onClick={e => { e.stopPropagation(); onToggle(!isDone) }}
        className={cn('flex-shrink-0 transition-colors', isDone ? 'text-green-500' : 'text-slate-300 hover:text-green-500')}
      >
        {isDone ? <CheckCircle2 size={13} /> : <Circle size={13} />}
      </button>
      <span className={cn('text-xs flex-1 min-w-0 truncate', isDone ? 'line-through text-slate-400' : 'text-slate-600')}>
        {task.titulo}
      </span>
      {task.fecha_limite && (
        <span className={cn('text-[10px] whitespace-nowrap hidden sm:block', isOverdue ? 'text-red-500 font-medium' : 'text-slate-400')}>
          {format(new Date(task.fecha_limite), 'd MMM', { locale: es })}
        </span>
      )}
      {assignee && <Avatar name={assignee.full_name} url={assignee.avatar_url} size={16} />}
    </div>
  )
}

// ─── SortableTaskRow ──────────────────────────────────────
function SortableTaskRow({
  task, isSelected, subtaskCount, subtaskDone, users, onToggle, onClick, onDelete,
}: {
  task: ProjectTask
  isSelected: boolean
  subtaskCount: number
  subtaskDone: number
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
  onToggle: (isDone: boolean) => void
  onClick: () => void
  onDelete: () => void
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
        <span className="text-[10px] text-slate-400 whitespace-nowrap hidden sm:block">{subtaskDone}/{subtaskCount}</span>
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
      <button
        onClick={e => {
          e.stopPropagation()
          onDelete()
        }}
        className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded transition-all flex-shrink-0"
        title="Eliminar tarea"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ─── AddSectionRow ────────────────────────────────────────
function AddSectionRow({ onAdd, isAdding }: { onAdd: (n: string) => void; isAdding: boolean }) {
  const [visible, setVisible] = useState(false)
  const [val,     setVal]     = useState('')

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

// ─── ProjectMembersMenu ───────────────────────────────────
function ProjectMembersMenu({
  projectId, users,
}: {
  projectId: string
  users: Pick<User, 'id' | 'full_name' | 'avatar_url'>[]
}) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      const r = await fetch(`/api/projects/${projectId}/members`)
      return r.json() as Promise<{ data: { id: string; user_id: string; role: string; user: { full_name: string; avatar_url: string | null } | null }[] }>
    },
    enabled: open,
    staleTime: 30_000,
  })
  const members = data?.data ?? []
  const memberIds = members.map(m => m.user_id)
  const nonMembers = users.filter(u => !memberIds.includes(u.id))

  async function addMember(userId: string) {
    await fetch(`/api/projects/${projectId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
    qc.invalidateQueries({ queryKey: ['project-members', projectId] })
  }

  async function removeMember(userId: string) {
    await fetch(`/api/projects/${projectId}/members?user_id=${userId}`, { method: 'DELETE' })
    qc.invalidateQueries({ queryKey: ['project-members', projectId] })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1 hover:border-slate-300 transition-colors"
      >
        <UserPlus size={12} />
        Miembros
        {members.length > 0 && (
          <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{members.length}</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 w-64 py-2">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider px-3 py-1">Asignados al proyecto</p>

            {members.length === 0 && (
              <p className="text-xs text-slate-400 px-3 py-2">Sin miembros aún</p>
            )}

            {members.map(m => (
              <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
                <Avatar name={m.user?.full_name ?? '?'} url={m.user?.avatar_url ?? null} size={22} />
                <span className="text-xs text-slate-700 flex-1 truncate">{m.user?.full_name ?? 'Usuario'}</span>
                <span className="text-[10px] text-slate-400 capitalize">{m.role}</span>
                <button onClick={() => removeMember(m.user_id)} className="text-slate-300 hover:text-red-500 transition-colors ml-1">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}

            {nonMembers.length > 0 && (
              <>
                <div className="border-t my-1.5" />
                <p className="text-[10px] text-slate-400 uppercase tracking-wider px-3 py-1">Agregar</p>
                {nonMembers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => addMember(u.id)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-blue-50 transition-colors text-left"
                  >
                    <Avatar name={u.full_name} url={u.avatar_url} size={22} />
                    <span className="text-xs text-slate-600">{u.full_name}</span>
                    <Plus size={11} className="ml-auto text-blue-500" />
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
