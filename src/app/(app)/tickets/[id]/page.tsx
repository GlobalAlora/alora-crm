'use client'

import { useState, useRef, use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Send, Trash2, FolderKanban, User as UserIcon,
  Calendar, AlertCircle, CheckCircle2, Paperclip, FileVideo, Loader2, X,
} from 'lucide-react'

type UploadedFile = { url: string; name: string; type: string }
import Link from 'next/link'
import type { Ticket, TicketEstado, TicketPrioridad, TicketCategoria, Project, User } from '@/types'

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
  nuevo:    'Nuevo desarrollo',
  otro:     'Otro',
}

function avatarInitials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function Avatar({ user }: { user: { full_name: string; avatar_url: string | null } | null | undefined }) {
  if (!user) return <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700" />
  if (user.avatar_url) return <img src={user.avatar_url} alt={user.full_name} className="w-7 h-7 rounded-full object-cover" />
  return (
    <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-semibold">
      {avatarInitials(user.full_name)}
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const [comment, setComment]       = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [editing, setEditing]       = useState<{ field: string; value: string } | null>(null)
  const [uploads, setUploads]       = useState<UploadedFile[]>([])
  const [uploading, setUploading]   = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!lightboxUrl) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxUrl(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxUrl])

  const { data: res, isLoading } = useQuery<{ data: Ticket }>({
    queryKey: ['ticket', id],
    queryFn: () => fetch(`/api/tickets/${id}`).then(r => r.json()),
  })

  const { data: projectsRes } = useQuery<{ data: Project[] }>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then(r => r.json()),
  })

  const { data: usersRes } = useQuery<{ data: User[] }>({
    queryKey: ['admin-users'],
    queryFn: () => fetch('/api/admin/users').then(r => r.json()),
  })

  const patch = useMutation({
    mutationFn: (body: object) =>
      fetch(`/api/tickets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', id] }),
  })

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    const results = await Promise.all(files.map(async (f) => {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/portal/upload', { method: 'POST', body: fd }).then(r => r.json())
      return res.url ? { url: res.url, name: res.name ?? f.name, type: res.type ?? f.type } : null
    }))
    setUploads(prev => [...prev, ...(results.filter(Boolean) as UploadedFile[])])
    setUploading(false)
    e.target.value = ''
  }

  const addComment = useMutation({
    mutationFn: ({ body, is_internal, attachments }: { body: string; is_internal: boolean; attachments: UploadedFile[] }) =>
      fetch(`/api/tickets/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, is_internal, attachments }) })
        .then(r => r.json()),
    onSuccess: () => {
      setComment('')
      setIsInternal(false)
      setUploads([])
      qc.invalidateQueries({ queryKey: ['ticket', id] })
      qc.invalidateQueries({ queryKey: ['tickets'] })
    },
  })

  const deleteTicket = useMutation({
    mutationFn: () => fetch(`/api/tickets/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => router.replace('/tickets'),
  })

  const ticket = res?.data
  const projects = projectsRes?.data ?? []
  const users = usersRes?.data ?? []

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-sm">Cargando ticket...</p>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <p className="text-muted-foreground">Ticket no encontrado</p>
        <Link href="/tickets" className="text-blue-500 text-sm hover:underline">Volver a tickets</Link>
      </div>
    )
  }

  const ec = ESTADO_CONFIG[ticket.estado]
  const pc = PRIORIDAD_CONFIG[ticket.prioridad]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.back()}
          className="mt-0.5 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-muted-foreground">{ticket.numero}</span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{ color: ec.color, background: ec.bg }}
            >
              {ec.label}
            </span>
            <span className="text-xs font-medium" style={{ color: pc.color }}>{pc.label}</span>
          </div>

          {editing?.field === 'titulo' ? (
            <input
              autoFocus
              className="w-full text-xl font-semibold bg-transparent border-b border-blue-500 text-foreground focus:outline-none"
              value={editing.value}
              onChange={e => setEditing({ field: 'titulo', value: e.target.value })}
              onBlur={() => {
                if (editing.value.trim() && editing.value !== ticket.titulo) patch.mutate({ titulo: editing.value.trim() })
                setEditing(null)
              }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
          ) : (
            <h1
              className="text-xl font-semibold text-foreground cursor-pointer hover:text-blue-500 transition-colors"
              onClick={() => setEditing({ field: 'titulo', value: ticket.titulo })}
            >
              {ticket.titulo}
            </h1>
          )}
        </div>

        <button
          onClick={() => { if (confirm('¿Eliminar este ticket?')) deleteTicket.mutate() }}
          className="p-2 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — description + comments */}
        <div className="lg:col-span-2 space-y-5">
          {/* Description */}
          <div className="bg-card border border-card-border rounded-2xl p-5">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Descripción</h2>
            {editing?.field === 'descripcion' ? (
              <textarea
                autoFocus
                rows={5}
                className="w-full bg-muted border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                value={editing.value}
                onChange={e => setEditing({ field: 'descripcion', value: e.target.value })}
                onBlur={() => {
                  patch.mutate({ descripcion: editing.value.trim() || null })
                  setEditing(null)
                }}
              />
            ) : (
              <p
                className="text-sm text-foreground/80 whitespace-pre-wrap cursor-pointer hover:text-foreground transition-colors min-h-[2rem]"
                onClick={() => setEditing({ field: 'descripcion', value: ticket.descripcion ?? '' })}
              >
                {ticket.descripcion || <span className="text-muted-foreground/50 italic">Sin descripción — click para agregar</span>}
              </p>
            )}
          </div>

          {/* Attachments */}
          {ticket.attachments && ticket.attachments.length > 0 && (
            <div className="bg-card border border-card-border rounded-2xl p-5">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Paperclip size={12} /> Archivos adjuntos ({ticket.attachments.length})
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {ticket.attachments.map((a, i) => (
                  <a
                    key={i}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative rounded-xl overflow-hidden border border-card-border bg-muted aspect-square flex items-center justify-center hover:border-blue-400 transition-colors"
                    title={a.name}
                  >
                    {a.type.startsWith('image/') ? (
                      <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 p-2 text-center">
                        <FileVideo size={22} className="text-muted-foreground" />
                        <span className="text-[9px] text-muted-foreground leading-tight break-all">
                          {a.name.slice(0, 16)}{a.name.length > 16 ? '…' : ''}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div className="bg-card border border-card-border rounded-2xl p-5">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              Comentarios {ticket.comments?.length ? `(${ticket.comments.length})` : ''}
            </h2>

            <div className="space-y-4 mb-5">
              {(ticket.comments ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground/50 italic">Sin comentarios aún</p>
              )}
              {(ticket.comments ?? []).map(c => (
                <div key={c.id} className="flex gap-3">
                  <Avatar user={c.user} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-xs font-medium text-foreground">{c.user?.full_name ?? 'Sistema'}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {c.body && <p className="text-sm text-foreground/80 whitespace-pre-wrap">{c.body}</p>}
                    {!!c.attachments?.length && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {c.attachments.map((a: UploadedFile, i: number) => (
                          a.type?.startsWith('image/') ? (
                            <button key={i} onClick={() => setLightboxUrl(a.url)} className="cursor-zoom-in">
                              <img src={a.url} alt={a.name} className="h-20 w-20 object-cover rounded-lg border border-card-border hover:opacity-90 transition-opacity" />
                            </button>
                          ) : (
                            <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted rounded-lg text-xs text-muted-foreground hover:text-foreground border border-card-border transition-colors">
                              <FileVideo size={12} /> {a.name}
                            </a>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* New comment */}
            <div className="pt-4 border-t border-card-border space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* Upload preview strip */}
              {(uploads.length > 0 || uploading) && (
                <div className="flex flex-wrap gap-2 px-1">
                  {uploads.map((u, i) => (
                    <div key={i} className="relative group">
                      {u.type.startsWith('image/') ? (
                        <img src={u.url} alt={u.name} className="h-16 w-16 object-cover rounded-lg border border-card-border" />
                      ) : (
                        <div className="h-16 w-16 flex flex-col items-center justify-center bg-muted rounded-lg border border-card-border gap-1 px-1">
                          <FileVideo size={18} className="text-muted-foreground" />
                          <span className="text-[9px] text-muted-foreground truncate w-full text-center">{u.name.slice(0, 10)}</span>
                        </div>
                      )}
                      <button
                        onClick={() => setUploads(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full hidden group-hover:flex items-center justify-center"
                      >
                        <X size={9} />
                      </button>
                    </div>
                  ))}
                  {uploading && (
                    <div className="h-16 w-16 flex items-center justify-center bg-muted rounded-lg border border-card-border">
                      <Loader2 size={16} className="animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && (comment.trim() || uploads.length)) {
                        addComment.mutate({ body: comment, is_internal: isInternal, attachments: uploads })
                      }
                    }}
                    rows={2}
                    placeholder="Agregar comentario... (Ctrl+Enter para enviar)"
                    className={`w-full px-3 py-2 rounded-xl bg-muted border text-sm text-foreground focus:outline-none focus:ring-2 resize-none ${isInternal ? 'border-amber-400 focus:ring-amber-400/30' : 'border-card-border focus:ring-blue-500'}`}
                  />
                </div>
                <div className="flex flex-col gap-1.5 self-end">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title="Adjuntar imagen o video"
                    className="p-2.5 rounded-xl bg-muted border border-card-border text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                  >
                    <Paperclip size={15} />
                  </button>
                  <button
                    onClick={() => (comment.trim() || uploads.length) && addComment.mutate({ body: comment, is_internal: isInternal, attachments: uploads })}
                    disabled={(!comment.trim() && !uploads.length) || addComment.isPending || uploading}
                    className={`p-2.5 rounded-xl text-white disabled:opacity-40 transition-colors ${isInternal ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {addComment.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInternal(v => !v)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${isInternal ? 'bg-amber-50 dark:bg-amber-950 border-amber-300 text-amber-700 dark:text-amber-400' : 'border-card-border text-muted-foreground hover:border-amber-300 hover:text-amber-600'}`}
              >
                {isInternal ? '🔒 Nota interna · no notifica al cliente' : 'Nota interna'}
              </button>
            </div>
          </div>
        </div>

        {/* Right — metadata */}
        <div className="space-y-4">
          {/* Estado */}
          <div className="bg-card border border-card-border rounded-2xl p-5">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Estado</h2>
            <select
              value={ticket.estado}
              onChange={e => patch.mutate({ estado: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
            >
              {Object.entries(ESTADO_CONFIG).map(([v, c]) => (
                <option key={v} value={v}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Prioridad + Categoría */}
          <div className="bg-card border border-card-border rounded-2xl p-5 space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Prioridad</label>
              <select
                value={ticket.prioridad}
                onChange={e => patch.mutate({ prioridad: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
              >
                {Object.entries(PRIORIDAD_CONFIG).map(([v, c]) => (
                  <option key={v} value={v}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Categoría</label>
              <select
                value={ticket.categoria}
                onChange={e => patch.mutate({ categoria: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
              >
                {Object.entries(CATEGORIA_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cliente (portal tickets) */}
          {ticket.client_nombre && (
            <div className="bg-card border border-card-border rounded-2xl p-5 space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Cliente</h2>
              <p className="text-sm font-medium text-foreground">{ticket.client_nombre}</p>
              {ticket.client_empresa && (
                <p className="text-xs text-muted-foreground">{ticket.client_empresa}</p>
              )}
              {ticket.client_email && (
                <a href={`mailto:${ticket.client_email}`} className="text-xs text-blue-500 hover:underline block">
                  {ticket.client_email}
                </a>
              )}
              {ticket.client_telefono && (
                <p className="text-xs text-muted-foreground">{ticket.client_telefono}</p>
              )}
            </div>
          )}

          {/* Horas */}
          <div className="bg-card border border-card-border rounded-2xl p-5">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Horas</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Estimadas</label>
                <input
                  key={`est-${ticket.id}-${ticket.horas_estimadas}`}
                  type="number"
                  min="0"
                  step="0.5"
                  defaultValue={ticket.horas_estimadas ?? ''}
                  placeholder="0"
                  onBlur={e => {
                    const val = e.target.value ? Number(e.target.value) : null
                    if (val !== ticket.horas_estimadas) patch.mutate({ horas_estimadas: val })
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Reales</label>
                <input
                  key={`real-${ticket.id}-${ticket.horas_reales}`}
                  type="number"
                  min="0"
                  step="0.5"
                  defaultValue={ticket.horas_reales ?? ''}
                  placeholder="0"
                  onBlur={e => {
                    const val = e.target.value ? Number(e.target.value) : null
                    if (val !== ticket.horas_reales) patch.mutate({ horas_reales: val })
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {ticket.horas_estimadas != null && ticket.horas_reales != null && (
                <p className={`text-xs font-medium ${ticket.horas_reales > ticket.horas_estimadas ? 'text-red-500' : 'text-green-600'}`}>
                  {ticket.horas_reales > ticket.horas_estimadas
                    ? `+${(ticket.horas_reales - ticket.horas_estimadas).toFixed(1)} hs sobre lo estimado`
                    : `${(ticket.horas_estimadas - ticket.horas_reales).toFixed(1)} hs bajo estimación`
                  }
                </p>
              )}
            </div>
          </div>

          {/* Project + Assignee */}
          <div className="bg-card border border-card-border rounded-2xl p-5 space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1">
                <FolderKanban size={12} /> Proyecto
              </label>
              <select
                value={ticket.project_id ?? ''}
                onChange={e => patch.mutate({ project_id: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
              >
                <option value="">Sin proyecto</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1">
                <UserIcon size={12} /> Asignado a
              </label>
              <select
                value={ticket.assignee_id ?? ''}
                onChange={e => patch.mutate({ assignee_id: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
              >
                <option value="">Sin asignar</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="bg-card border border-card-border rounded-2xl p-5 space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fechas</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar size={12} />
              <span>Creado el {new Date(ticket.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
            </div>
            {ticket.resolved_at && (
              <div className="flex items-center gap-2 text-xs text-green-600">
                <CheckCircle2 size={12} />
                <span>Resuelto el {new Date(ticket.resolved_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
            )}
            {ticket.creator && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertCircle size={12} />
                <span>Por {ticket.creator.full_name}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/40 rounded-full p-1.5"
          >
            <X size={20} />
          </button>
          <img
            src={lightboxUrl}
            alt=""
            className="max-w-full max-h-full rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
