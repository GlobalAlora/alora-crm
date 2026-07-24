'use client'

import { useState, use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Circle, CheckCircle2, FolderKanban, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type { Project, TaskSection, ProjectTask } from '@/types'

const ESTADO_CONFIG: Record<string, { label: string; color: string }> = {
  pendiente:     { label: 'Pendiente',     color: 'text-slate-600 bg-slate-100' },
  en_desarrollo: { label: 'En desarrollo', color: 'text-blue-700  bg-blue-50'   },
  en_revision:   { label: 'En revisión',   color: 'text-amber-700 bg-amber-50'  },
  en_pausa:      { label: 'En pausa',      color: 'text-red-700   bg-red-50'    },
  finalizado:    { label: 'Finalizado',    color: 'text-green-700 bg-green-50'  },
}

interface ProjectDetail extends Project {
  sections?: (TaskSection & { tasks?: ProjectTask[] })[]
}

async function fetchProject(id: string): Promise<{ data: ProjectDetail }> {
  const r = await fetch(`/api/projects/${id}`)
  if (!r.ok) throw new Error('Proyecto no encontrado')
  return r.json()
}

async function apiCreateTask(projectId: string, sectionId: string | null, titulo: string): Promise<{ data: ProjectTask }> {
  const r = await fetch(`/api/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titulo, section_id: sectionId }),
  })
  const json = await r.json()
  if (!r.ok) throw new Error(json.error || 'Error al crear tarea')
  return json
}

async function apiPatchTask(taskId: string, updates: Record<string, unknown>): Promise<void> {
  const r = await fetch(`/api/project-tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!r.ok) {
    const json = await r.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error || 'Error al actualizar tarea')
  }
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => fetchProject(id),
    staleTime: 30_000,
  })

  const addTaskMutation = useMutation({
    mutationFn: ({ sectionId, titulo }: { sectionId: string | null; titulo: string }) =>
      apiCreateTask(id, sectionId, titulo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleTaskMutation = useMutation({
    mutationFn: ({ taskId, isDone }: { taskId: string; isDone: boolean }) =>
      apiPatchTask(taskId, { estado: isDone ? 'finalizada' : 'pendiente' }),
    onMutate: async ({ taskId, isDone }) => {
      await qc.cancelQueries({ queryKey: ['project', id] })
      const prev = qc.getQueryData<{ data: ProjectDetail }>(['project', id])
      if (prev?.data.sections) {
        qc.setQueryData(['project', id], {
          ...prev,
          data: {
            ...prev.data,
            sections: prev.data.sections.map(s => ({
              ...s,
              tasks: s.tasks?.map(t =>
                t.id === taskId ? { ...t, estado: isDone ? 'finalizada' : 'pendiente' } : t
              ),
            })),
          },
        })
      }
      return { prev }
    },
    onError: (e: Error, _, ctx) => {
      if (ctx?.prev) qc.setQueryData(['project', id], ctx.prev)
      toast.error(e.message)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  })

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-white">
          <div className="h-6 w-48 bg-slate-100 rounded animate-pulse" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-slate-500">Proyecto no encontrado</p>
          <Link href="/projects" className="text-blue-600 text-sm mt-2 inline-block">← Volver a proyectos</Link>
        </div>
      </div>
    )
  }

  const project = data.data
  const estadoConfig = ESTADO_CONFIG[project.estado]
  const client = project.lead?.empresa || [project.lead?.nombre, project.lead?.apellido].filter(Boolean).join(' ')
  const sections = project.sections ?? []
  const allTasks  = sections.flatMap(s => s.tasks ?? []).filter(t => !t.deleted_at)
  const totalTasks = allTasks.length
  const doneTasks  = allTasks.filter(t => t.estado === 'finalizada').length
  const progress   = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/projects" className="text-slate-400 hover:text-slate-700 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: project.color }} />
          <h1 className="text-lg font-semibold text-slate-900 flex-1 min-w-0 truncate">{project.nombre}</h1>
          <span className={cn('px-2.5 py-1 text-xs font-medium rounded-full', estadoConfig.color)}>
            {estadoConfig.label}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-500 pl-9 flex-wrap">
          {client && (
            <span className="flex items-center gap-1.5">
              <FolderKanban size={13} />
              {project.lead_id ? (
                <Link href={`/leads?lead=${project.lead_id}`} className="hover:text-blue-600 flex items-center gap-1">
                  {client}
                  <ExternalLink size={11} />
                </Link>
              ) : client}
            </span>
          )}
          {project.fecha_fin && (
            <span>Entrega: {format(new Date(project.fecha_fin), 'd MMM yyyy', { locale: es })}</span>
          )}
          {project.descripcion && (
            <span className="text-slate-400 truncate max-w-xs">{project.descripcion}</span>
          )}
        </div>

        {/* Progress bar */}
        {totalTasks > 0 && (
          <div className="mt-3 pl-9">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">{doneTasks}/{totalTasks}</span>
            </div>
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {sections.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p>Las secciones se cargan desde la base de datos...</p>
          </div>
        ) : (
          sections
            .sort((a, b) => a.position - b.position)
            .map(section => (
              <SectionBlock
                key={section.id}
                section={section}
                onAddTask={(titulo) => addTaskMutation.mutate({ sectionId: section.id, titulo })}
                onToggleTask={(taskId, isDone) => toggleTaskMutation.mutate({ taskId, isDone })}
                isAdding={addTaskMutation.isPending}
              />
            ))
        )}
      </div>
    </div>
  )
}

function SectionBlock({
  section,
  onAddTask,
  onToggleTask,
  isAdding,
}: {
  section: TaskSection & { tasks?: ProjectTask[] }
  onAddTask: (titulo: string) => void
  onToggleTask: (taskId: string, isDone: boolean) => void
  isAdding: boolean
}) {
  const [inputVisible, setInputVisible] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const tasks = (section.tasks ?? []).filter(t => !t.deleted_at).sort((a, b) => a.position - b.position)

  function handleSubmit() {
    const title = inputVal.trim()
    if (!title) return
    onAddTask(title)
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

      <div className="space-y-1 mb-2">
        {tasks.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={(isDone) => onToggleTask(task.id, isDone)}
          />
        ))}
        {tasks.length === 0 && !inputVisible && (
          <p className="text-xs text-slate-300 px-1 py-1">Sin tareas</p>
        )}
      </div>

      {inputVisible ? (
        <div className="flex items-center gap-2 bg-white border border-blue-300 rounded-lg px-3 py-2">
          <input
            autoFocus
            type="text"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSubmit()
              if (e.key === 'Escape') { setInputVisible(false); setInputVal('') }
            }}
            placeholder="Nombre de la tarea"
            className="flex-1 text-sm outline-none"
          />
          <button
            onClick={handleSubmit}
            disabled={!inputVal.trim() || isAdding}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            Agregar
          </button>
          <button
            onClick={() => { setInputVisible(false); setInputVal('') }}
            className="text-sm text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setInputVisible(true)}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1 px-1"
        >
          <Plus size={12} />
          Agregar tarea
        </button>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle }: { task: ProjectTask; onToggle: (isDone: boolean) => void }) {
  const isDone = task.estado === 'finalizada'

  return (
    <div className="flex items-center gap-2.5 bg-white border border-slate-100 rounded-lg px-3 py-2.5 hover:border-slate-200 transition-colors group">
      <button
        onClick={() => onToggle(!isDone)}
        className="flex-shrink-0 text-slate-300 hover:text-green-500 transition-colors"
        aria-label={isDone ? 'Marcar pendiente' : 'Marcar finalizada'}
      >
        {isDone
          ? <CheckCircle2 size={16} className="text-green-500" />
          : <Circle size={16} />
        }
      </button>
      <span className={cn('text-sm flex-1 min-w-0 truncate', isDone ? 'line-through text-slate-400' : 'text-slate-700')}>
        {task.titulo}
      </span>
      {task.fecha_limite && (
        <span className="text-xs text-slate-400 whitespace-nowrap hidden sm:block">
          {format(new Date(task.fecha_limite), 'd MMM', { locale: es })}
        </span>
      )}
    </div>
  )
}
