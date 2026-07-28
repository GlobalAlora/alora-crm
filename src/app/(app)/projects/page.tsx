'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, FolderKanban, Calendar, Search, ChevronRight,
  MoreHorizontal, Archive, ArchiveRestore, Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type { Project, ProjectEstado, PmPriority } from '@/types'

const ESTADO_CONFIG: Record<ProjectEstado, { label: string; color: string; dot: string }> = {
  pendiente:     { label: 'Pendiente',     color: 'text-slate-600 bg-slate-100',  dot: 'bg-slate-400' },
  en_desarrollo: { label: 'En desarrollo', color: 'text-blue-700  bg-blue-50',    dot: 'bg-blue-500'  },
  en_revision:   { label: 'En revisión',   color: 'text-amber-700 bg-amber-50',   dot: 'bg-amber-500' },
  en_pausa:      { label: 'En pausa',      color: 'text-red-700   bg-red-50',     dot: 'bg-red-500'   },
  finalizado:    { label: 'Finalizado',    color: 'text-green-700 bg-green-50',   dot: 'bg-green-500' },
}

const PRIORIDAD_CONFIG: Record<PmPriority, { label: string; color: string }> = {
  baja:    { label: 'Baja',    color: 'text-slate-500' },
  media:   { label: 'Media',   color: 'text-blue-600'  },
  alta:    { label: 'Alta',    color: 'text-amber-600' },
  urgente: { label: 'Urgente', color: 'text-red-600'   },
}

const FILTER_TABS: { value: ProjectEstado | '' | 'archivados'; label: string }[] = [
  { value: '',              label: 'Todos'         },
  { value: 'en_desarrollo', label: 'En desarrollo' },
  { value: 'en_revision',   label: 'En revisión'   },
  { value: 'pendiente',     label: 'Pendiente'     },
  { value: 'en_pausa',      label: 'En pausa'      },
  { value: 'finalizado',    label: 'Finalizado'    },
  { value: 'archivados',    label: 'Archivados'    },
]

async function fetchProjects(filtro: string): Promise<{ data: Project[] }> {
  const params = new URLSearchParams()
  if (filtro === 'archivados') {
    params.set('archived', 'true')
  } else if (filtro) {
    params.set('estado', filtro)
  }
  const url = `/api/projects${params.toString() ? `?${params}` : ''}`
  const r = await fetch(url)
  if (!r.ok) {
    const json = await r.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error ?? `HTTP ${r.status}`)
  }
  return r.json()
}

async function createProject(body: Record<string, unknown>): Promise<{ data: Project }> {
  const r = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await r.json()
  if (!r.ok) throw new Error(json.error || 'Error al crear proyecto')
  return json
}

async function patchProject(projectId: string, updates: Record<string, unknown>) {
  const r = await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  const json = await r.json()
  if (!r.ok) throw new Error((json as { error?: string }).error ?? 'Error al actualizar proyecto')
  return json
}

async function deleteProject(projectId: string) {
  const r = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
  const json = await r.json()
  if (!r.ok) throw new Error((json as { error?: string }).error ?? 'Error al eliminar proyecto')
  return json
}

interface NewProjectForm {
  nombre: string
  descripcion: string
  estado: ProjectEstado
  prioridad: PmPriority
  fecha_inicio: string
  fecha_fin: string
}

const EMPTY_FORM: NewProjectForm = {
  nombre: '',
  descripcion: '',
  estado: 'pendiente',
  prioridad: 'media',
  fecha_inicio: '',
  fecha_fin: '',
}

export default function ProjectsPage() {
  const [filtro, setFiltro] = useState<ProjectEstado | '' | 'archivados'>('')
  const [buscar, setBuscar] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NewProjectForm>(EMPTY_FORM)
  const qc = useQueryClient()

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ['projects', filtro],
    queryFn: () => fetchProjects(filtro),
    staleTime: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      toast.success('Proyecto creado')
      qc.invalidateQueries({ queryKey: ['projects'] })
      setShowModal(false)
      setForm(EMPTY_FORM)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const archiveMutation = useMutation({
    mutationFn: ({ projectId, archive }: { projectId: string; archive: boolean }) =>
      patchProject(projectId, { archived_at: archive ? new Date().toISOString() : null }),
    onSuccess: (_data, { archive }) => {
      toast.success(archive ? 'Proyecto archivado' : 'Proyecto restaurado')
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      toast.success('Proyecto eliminado')
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const projects = (data?.data ?? []).filter(p => {
    if (!buscar) return true
    const q = buscar.toLowerCase()
    return (
      p.nombre.toLowerCase().includes(q) ||
      p.lead?.empresa?.toLowerCase().includes(q) ||
      p.lead?.nombre?.toLowerCase().includes(q)
    )
  })

  const isArchived = filtro === 'archivados'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <FolderKanban size={20} className="text-slate-500" />
          <h1 className="text-lg font-semibold text-slate-900">Proyectos</h1>
          {data && (
            <span className="text-sm text-slate-400">({projects.length})</span>
          )}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
        >
          <Plus size={15} />
          Nuevo proyecto
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 px-6 py-3 border-b bg-white flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar..."
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 w-52"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setFiltro(tab.value)}
              className={cn(
                'px-3 py-1 text-sm rounded-md font-medium transition-colors',
                filtro === tab.value
                  ? tab.value === 'archivados'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : queryError ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-red-500 font-medium">Error al cargar proyectos</p>
            <p className="text-slate-400 text-sm mt-2 font-mono bg-slate-50 px-3 py-2 rounded">
              {(queryError as Error).message}
            </p>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <FolderKanban size={48} className="text-slate-200 mb-4" />
            <p className="text-slate-500 font-medium">
              {isArchived ? 'No hay proyectos archivados' : 'No hay proyectos'}
            </p>
            {!isArchived && (
              <p className="text-slate-400 text-sm mt-1">
                Los clientes ganados generan un proyecto automáticamente, o creá uno manual.
              </p>
            )}
            {!isArchived && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-md"
              >
                <Plus size={14} />
                Nuevo proyecto
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            {projects.map(project => (
              <ProjectRow
                key={project.id}
                project={project}
                isArchived={isArchived}
                onArchive={() => archiveMutation.mutate({ projectId: project.id, archive: true })}
                onUnarchive={() => archiveMutation.mutate({ projectId: project.id, archive: false })}
                onDelete={() => deleteMutation.mutate(project.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b">
              <h2 className="text-base font-semibold text-slate-900">Nuevo proyecto</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
                <input
                  autoFocus
                  type="text"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Nombre del proyecto"
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Descripción</label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  rows={2}
                  placeholder="Descripción opcional"
                  className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
                  <select
                    value={form.estado}
                    onChange={e => setForm(f => ({ ...f, estado: e.target.value as ProjectEstado }))}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {Object.entries(ESTADO_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Prioridad</label>
                  <select
                    value={form.prioridad}
                    onChange={e => setForm(f => ({ ...f, prioridad: e.target.value as PmPriority }))}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {Object.entries(PRIORIDAD_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Inicio</label>
                  <input
                    type="date"
                    value={form.fecha_inicio}
                    onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Entrega</label>
                  <input
                    type="date"
                    value={form.fecha_fin}
                    onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))}
                    className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setForm(EMPTY_FORM) }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={!form.nombre.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({
                  nombre:       form.nombre,
                  descripcion:  form.descripcion || null,
                  estado:       form.estado,
                  prioridad:    form.prioridad,
                  fecha_inicio: form.fecha_inicio || null,
                  fecha_fin:    form.fecha_fin    || null,
                })}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? 'Creando...' : 'Crear proyecto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectRow({
  project, isArchived, onArchive, onUnarchive, onDelete,
}: {
  project: Project
  isArchived: boolean
  onArchive: () => void
  onUnarchive: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const estado = ESTADO_CONFIG[project.estado]
  const prio   = PRIORIDAD_CONFIG[project.prioridad]
  const client = project.lead?.empresa || [project.lead?.nombre, project.lead?.apellido].filter(Boolean).join(' ')

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setConfirmDelete(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div className="flex items-center gap-0 bg-white border border-slate-100 rounded-lg hover:border-slate-300 hover:shadow-sm transition-all group">
      {/* Main clickable area */}
      <Link
        href={`/projects/${project.id}`}
        className="flex items-center gap-4 flex-1 min-w-0 px-4 py-3"
      >
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: project.color }}
        />
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium text-slate-900 truncate', isArchived && 'text-slate-400')}>
            {project.nombre}
          </p>
          {client && (
            <p className="text-xs text-slate-400 truncate">{client}</p>
          )}
        </div>
        <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap', estado.color)}>
          {estado.label}
        </span>
        <span className={cn('text-xs font-medium whitespace-nowrap hidden sm:block', prio.color)}>
          {prio.label}
        </span>
        {project.fecha_fin && (
          <div className="flex items-center gap-1 text-xs text-slate-400 whitespace-nowrap hidden md:flex">
            <Calendar size={12} />
            {format(new Date(project.fecha_fin), 'd MMM yyyy', { locale: es })}
          </div>
        )}
        <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
      </Link>

      {/* Actions menu */}
      <div className="pr-2 relative flex-shrink-0" ref={menuRef}>
        <button
          onClick={(e) => { e.preventDefault(); setMenuOpen(o => !o); setConfirmDelete(false) }}
          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors opacity-0 group-hover:opacity-100"
          title="Opciones"
        >
          <MoreHorizontal size={15} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20 min-w-40">
            {isArchived ? (
              <button
                onClick={() => { setMenuOpen(false); onUnarchive() }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ArchiveRestore size={14} className="text-slate-400" />
                Restaurar proyecto
              </button>
            ) : (
              <button
                onClick={() => { setMenuOpen(false); onArchive() }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Archive size={14} className="text-slate-400" />
                Archivar proyecto
              </button>
            )}

            <div className="my-1 border-t border-slate-100" />

            {confirmDelete ? (
              <div className="px-3 py-2">
                <p className="text-xs text-slate-500 mb-2">¿Seguro? Esta acción no se puede deshacer.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setMenuOpen(false); setConfirmDelete(false); onDelete() }}
                    className="flex-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white py-1 rounded transition-colors"
                  >
                    Eliminar
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 text-xs text-slate-600 hover:text-slate-900 py-1 rounded border border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} />
                Eliminar proyecto
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
