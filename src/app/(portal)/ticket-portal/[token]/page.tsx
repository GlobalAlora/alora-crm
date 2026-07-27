'use client'

import { useState, use, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, CheckCircle2, Clock, AlertCircle, Loader2, Paperclip, FileVideo, X } from 'lucide-react'
import type { TicketEstado } from '@/types'

type UploadedFile = { url: string; name: string; type: string }

// ─── helpers ───────────────────────────────────────────────

const ESTADO_CONFIG: Record<TicketEstado, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  nuevo:       { label: 'Nuevo',       color: '#3b82f6', bg: '#eff6ff',  icon: AlertCircle   },
  en_progreso: { label: 'En progreso', color: '#f59e0b', bg: '#fffbeb',  icon: Clock         },
  en_espera:   { label: 'En espera',   color: '#f97316', bg: '#fff7ed',  icon: Clock         },
  resuelto:    { label: 'Resuelto',    color: '#22c55e', bg: '#f0fdf4',  icon: CheckCircle2  },
  cerrado:     { label: 'Cerrado',     color: '#94a3b8', bg: '#f8fafc',  icon: CheckCircle2  },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1)  return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)   return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}

interface PortalTicket {
  id: string
  numero: string
  titulo: string
  descripcion: string | null
  estado: TicketEstado
  prioridad: string
  created_at: string
  resolved_at: string | null
  client_nombre: string | null
  comments: {
    id: string
    body: string
    is_client: boolean
    author_name: string
    created_at: string
    attachments?: UploadedFile[]
  }[]
}

// ─── Page ───────────────────────────────────────────────────

export default function TicketTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const qc = useQueryClient()
  const [message, setMessage]   = useState('')
  const [uploads, setUploads]   = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const { data: res, isLoading, error: fetchErr } = useQuery<{ data: PortalTicket; error?: string }>({
    queryKey: ['portal-ticket', token],
    queryFn: () => fetch(`/api/portal/tickets/${token}`).then(r => r.json()),
    refetchInterval: 30_000,
  })

  const addComment = useMutation({
    mutationFn: ({ body, attachments }: { body: string; attachments: UploadedFile[] }) =>
      fetch(`/api/portal/tickets/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, attachments, client_nombre: res?.data?.client_nombre ?? 'Cliente' }),
      }).then(r => r.json()),
    onSuccess: () => {
      setMessage('')
      setUploads([])
      qc.invalidateQueries({ queryKey: ['portal-ticket', token] })
    },
  })

  const ticket: PortalTicket | null = res?.data ?? null
  const isClosed = ticket && ['resuelto', 'cerrado'].includes(ticket.estado)

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="https://www.globalalora.com/logo-nav-white.png"
              alt="Alora"
              style={{ height: 32, display: 'block', objectFit: 'contain' }}
            />
            <span className="text-slate-400 text-sm">Centro de Soporte</span>
          </div>
          {ticket && (
            <span className="font-mono text-slate-400 text-sm">{ticket.numero}</span>
          )}
        </div>
      </header>

      <main className="flex-1 py-10 px-4">
        <div className="max-w-2xl mx-auto space-y-4">

          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-slate-400" />
            </div>
          )}

          {(fetchErr || res?.error) && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center">
              <p className="text-slate-500 dark:text-slate-400 text-sm">No pudimos encontrar este ticket.</p>
              <a href="/ticket-portal" className="text-blue-500 text-sm hover:underline mt-2 inline-block">Volver al formulario</a>
            </div>
          )}

          {ticket && (
            <>
              {/* Status card */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                <div className="flex items-start gap-4">
                  <div>
                    {(() => {
                      const ec = ESTADO_CONFIG[ticket.estado]
                      const Icon = ec.icon
                      return (
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: ec.bg }}>
                          <Icon size={20} style={{ color: ec.color }} />
                        </div>
                      )
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                        style={{ color: ESTADO_CONFIG[ticket.estado].color, background: ESTADO_CONFIG[ticket.estado].bg }}
                      >
                        {ESTADO_CONFIG[ticket.estado].label}
                      </span>
                    </div>
                    <h1 className="text-base font-semibold text-slate-900 dark:text-white">{ticket.titulo}</h1>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Abierto {timeAgo(ticket.created_at)}
                      {ticket.resolved_at && ` · Resuelto ${timeAgo(ticket.resolved_at)}`}
                    </p>
                  </div>
                </div>

                {ticket.descripcion && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{ticket.descripcion}</p>
                  </div>
                )}
              </div>

              {/* Thread */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Conversación {ticket.comments.length > 0 ? `(${ticket.comments.length})` : ''}
                  </h2>
                </div>

                {/* Comments */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ticket.comments.length === 0 && (
                    <div className="px-6 py-8 text-center">
                      <p className="text-sm text-slate-400">Aún no hay mensajes. Nuestro equipo te responderá aquí.</p>
                    </div>
                  )}
                  {ticket.comments.map(c => (
                    <div
                      key={c.id}
                      className={`px-6 py-4 ${c.is_client ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          c.is_client ? 'bg-blue-500 text-white' : 'bg-slate-700 text-white'
                        }`}>
                          {c.author_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{c.author_name}</span>
                        {!c.is_client && (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                            Equipo Alora
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 ml-auto">{timeAgo(c.created_at)}</span>
                      </div>
                      {c.body && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap pl-8">{c.body}</p>}
                      {(c.attachments ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2 pl-8">
                          {c.attachments!.map((a, i) => (
                            a.type?.startsWith('image/') ? (
                              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer">
                                <img src={a.url} alt={a.name} className="h-24 w-24 object-cover rounded-xl border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity" />
                              </a>
                            ) : (
                              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors border border-slate-200 dark:border-slate-700">
                                <FileVideo size={13} /> {a.name}
                              </a>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Reply box */}
                {!isClosed ? (
                  <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
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
                      <div className="flex flex-wrap gap-2">
                        {uploads.map((u, i) => (
                          <div key={i} className="relative group">
                            {u.type.startsWith('image/') ? (
                              <img src={u.url} alt={u.name} className="h-16 w-16 object-cover rounded-xl border border-slate-200 dark:border-slate-700" />
                            ) : (
                              <div className="h-16 w-16 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 gap-1 px-1">
                                <FileVideo size={18} className="text-slate-400" />
                                <span className="text-[9px] text-slate-400 truncate w-full text-center">{u.name.slice(0, 10)}</span>
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
                          <div className="h-16 w-16 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                            <Loader2 size={16} className="animate-spin text-slate-400" />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <textarea
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        rows={2}
                        placeholder="Escribí tu mensaje..."
                        onKeyDown={e => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && (message.trim() || uploads.length)) {
                            addComment.mutate({ body: message, attachments: uploads })
                          }
                        }}
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <div className="flex flex-col gap-1.5 self-end">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          title="Adjuntar imagen o video"
                          className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-40 transition-colors"
                        >
                          <Paperclip size={15} />
                        </button>
                        <button
                          onClick={() => (message.trim() || uploads.length) && addComment.mutate({ body: message, attachments: uploads })}
                          disabled={(!message.trim() && !uploads.length) || addComment.isPending || uploading}
                          className="p-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-100 disabled:opacity-40 transition-colors"
                        >
                          {addComment.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">Ctrl+Enter para enviar</p>
                  </div>
                ) : (
                  <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 text-center">
                    <p className="text-xs text-slate-400">Este ticket está {ESTADO_CONFIG[ticket.estado].label.toLowerCase()}.</p>
                    <a href="/ticket-portal" className="text-blue-500 text-xs hover:underline mt-1 inline-block">Abrir un nuevo ticket →</a>
                  </div>
                )}
              </div>
            </>
          )}

          <p className="text-center text-xs text-slate-400 dark:text-slate-600 pb-4">
            Alora Digital · <a href="https://globalalora.com" className="hover:text-slate-600 dark:hover:text-slate-400 transition-colors">globalalora.com</a>
          </p>
        </div>
      </main>
    </div>
  )
}
