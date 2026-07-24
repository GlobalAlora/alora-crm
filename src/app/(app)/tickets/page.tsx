'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Ticket, AlertCircle, Clock, CheckCircle2, Search, X } from 'lucide-react'
import Link from 'next/link'
import type { Ticket as TicketType, TicketEstado, TicketPrioridad, TicketCategoria, Project, User } from '@/types'

// ─── helpers ───────────────────────────────────────────────

const ESTADO_CONFIG: Record<TicketEstado, { label: string; color: string; bg: string }> = {
  nuevo:       { label: 'Nuevo',       color: '#3b82f6', bg: '#eff6ff' },
  en_progreso: { label: 'En progreso', color: '#f59e0b', bg: '#fffbeb' },
  en_espera:   { label: 'En espera',   color: '#f97316', bg: '#fff7ed' },
  resuelto:    { label: 'Resuelto',    color: '#22c55e', bg: '#f0fdf4' },
  cerrado:     { label: 'Cerrado',     color: '#94a3b8', bg: '#f8fafc' },
}

const PRIORIDAD_CONFIG: Record<TicketPrioridad, { label: string; color: string }> = {
  baja:    { label: 'Baja',    color: '#94a3b8' },
  media:   { label: 'Media',   color: '#3b82f6' },
  alta:    { label: 'Alta',    color: '#f97316' },
  urgente: { label: 'Urgente', color: '#ef4444' },
}

const CATEGORIA_LABELS: Record<TicketCategoria, string> = {
  bug:      'Bug',
  soporte:  'Soporte',
  consulta: 'Consulta',
  mejora:   'Mejora',
  otro:     'Otro',
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number; color: string
}) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: color + '20' }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

// ─── NewTicketModal ─────────────────────────────────────────

function NewTicketModal({ onClose, projects, users }: {
  onClose: () => void
  projects: Project[]
  users: User[]
}) {
  const qc = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<TicketPrioridad>('media')
  const [categoria, setCategoria] = useState<TicketCategoria>('soporte')
  const [projectId, setProjectId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [error, setError] = useState('')

  const create = useMutation({
    mutationFn: (body: object) =>
      fetch('/api/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(r => r.json()),
    onSuccess: (res) => {
      if (res.error) { setError(res.error); return }
      qc.invalidateQueries({ queryKey: ['tickets'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-card-border rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-card-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Nuevo ticket</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-red-500">{error}</p>}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Título *</label>
            <input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describí brevemente el problema..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Descripción</label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Detalle del ticket..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Prioridad</label>
              <select
                value={prioridad}
                onChange={e => setPrioridad(e.target.value as TicketPrioridad)}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
              >
                {Object.entries(PRIORIDAD_CONFIG).map(([v, c]) => (
                  <option key={v} value={v}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Categoría</label>
              <select
                value={categoria}
                onChange={e => setCategoria(e.target.value as TicketCategoria)}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
              >
                {Object.entries(CATEGORIA_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Proyecto</label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
              >
                <option value="">Sin proyecto</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Asignado a</label>
              <select
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
              >
                <option value="">Sin asignar</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
          <button
            onClick={() => create.mutate({ titulo, descripcion, prioridad, categoria, project_id: projectId || undefined, assignee_id: assigneeId || undefined })}
            disabled={!titulo.trim() || create.isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {create.isPending ? 'Creando...' : 'Crear ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────

type Tab = 'todos' | TicketEstado

export default function TicketsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('todos')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)

  const { data: ticketsRes, isLoading } = useQuery<{ data: TicketType[] }>({
    queryKey: ['tickets'],
    queryFn: () => fetch('/api/tickets').then(r => r.json()),
  })

  const { data: projectsRes } = useQuery<{ data: Project[] }>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then(r => r.json()),
  })

  const { data: usersRes } = useQuery<{ data: User[] }>({
    queryKey: ['admin-users'],
    queryFn: () => fetch('/api/admin/users').then(r => r.json()),
  })

  useEffect(() => {
    if (ticketsRes && 'error' in ticketsRes && (ticketsRes as { error?: string }).error) {
      router.replace('/projects')
    }
  }, [ticketsRes, router])

  const tickets = ticketsRes?.data ?? []
  const projects = projectsRes?.data ?? []
  const users = usersRes?.data ?? []

  const filtered = tickets.filter(t => {
    if (tab !== 'todos' && t.estado !== tab) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        t.numero.toLowerCase().includes(q) ||
        t.titulo.toLowerCase().includes(q) ||
        t.project?.nombre?.toLowerCase().includes(q) ||
        t.assignee?.full_name?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const stats = {
    total:       tickets.filter(t => !['cerrado'].includes(t.estado)).length,
    urgentes:    tickets.filter(t => t.prioridad === 'urgente' && !['cerrado', 'resuelto'].includes(t.estado)).length,
    en_espera:   tickets.filter(t => t.estado === 'en_espera').length,
    resueltos:   tickets.filter(t => t.estado === 'resuelto').length,
  }

  const TABS: { value: Tab; label: string; count?: number }[] = [
    { value: 'todos',       label: 'Todos',       count: tickets.length },
    { value: 'nuevo',       label: 'Nuevos',      count: tickets.filter(t => t.estado === 'nuevo').length },
    { value: 'en_progreso', label: 'En progreso', count: tickets.filter(t => t.estado === 'en_progreso').length },
    { value: 'en_espera',   label: 'En espera',   count: tickets.filter(t => t.estado === 'en_espera').length },
    { value: 'resuelto',    label: 'Resueltos',   count: tickets.filter(t => t.estado === 'resuelto').length },
    { value: 'cerrado',     label: 'Cerrados',    count: tickets.filter(t => t.estado === 'cerrado').length },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <Ticket size={20} className="text-purple-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Tickets</h1>
            <p className="text-xs text-muted-foreground">Soporte e incidencias</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} /> Nuevo ticket
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Ticket}       label="Abiertos"  value={stats.total}     color="#3b82f6" />
        <StatCard icon={AlertCircle}  label="Urgentes"  value={stats.urgentes}  color="#ef4444" />
        <StatCard icon={Clock}        label="En espera" value={stats.en_espera} color="#f97316" />
        <StatCard icon={CheckCircle2} label="Resueltos" value={stats.resueltos} color="#22c55e" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Tabs */}
        <div className="flex overflow-x-auto gap-1 bg-muted/50 rounded-xl p-1 min-w-0">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                tab === t.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.value ? 'bg-blue-100 text-blue-600' : 'bg-muted text-muted-foreground'}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-0 flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ticket..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Cargando tickets...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Ticket size={32} className="mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground text-sm">No hay tickets</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Número</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Título</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Proyecto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Categoría</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Prioridad</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden lg:table-cell">Asignado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ticket => {
                  const ec = ESTADO_CONFIG[ticket.estado]
                  const pc = PRIORIDAD_CONFIG[ticket.prioridad]
                  return (
                    <tr
                      key={ticket.id}
                      className="border-b border-card-border last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => router.push(`/tickets/${ticket.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{ticket.numero}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground line-clamp-1">{ticket.titulo}</p>
                        {ticket.comments_count ? (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{ticket.comments_count} comentario{ticket.comments_count !== 1 ? 's' : ''}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {ticket.project ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ticket.project.color }} />
                            <span className="text-muted-foreground text-xs truncate max-w-[120px]">{ticket.project.nombre}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">{CATEGORIA_LABELS[ticket.categoria]}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium" style={{ color: pc.color }}>
                          {pc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {ticket.assignee ? (
                          <span className="text-xs text-muted-foreground">{ticket.assignee.full_name}</span>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                          style={{ color: ec.color, background: ec.bg }}
                        >
                          {ec.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                        {new Date(ticket.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && (
        <NewTicketModal
          onClose={() => setShowNew(false)}
          projects={projects}
          users={users}
        />
      )}
    </div>
  )
}
