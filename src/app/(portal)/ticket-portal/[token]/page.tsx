'use client'

import { useState, use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react'
import type { TicketEstado } from '@/types'

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
  }[]
}

// ─── Page ───────────────────────────────────────────────────

export default function TicketTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const qc = useQueryClient()
  const [message, setMessage] = useState('')

  const { data: res, isLoading, error: fetchErr } = useQuery<{ data: PortalTicket; error?: string }>({
    queryKey: ['portal-ticket', token],
    queryFn: () => fetch(`/api/portal/tickets/${token}`).then(r => r.json()),
    refetchInterval: 30_000,
  })

  const addComment = useMutation({
    mutationFn: (body: string) =>
      fetch(`/api/portal/tickets/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, client_nombre: res?.data?.client_nombre ?? 'Cliente' }),
      }).then(r => r.json()),
    onSuccess: () => {
      setMessage('')
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
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap pl-8">{c.body}</p>
                    </div>
                  ))}
                </div>

                {/* Reply box */}
                {!isClosed ? (
                  <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex gap-3">
                      <textarea
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        rows={2}
                        placeholder="Escribí tu mensaje..."
                        onKeyDown={e => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && message.trim()) {
                            addComment.mutate(message)
                          }
                        }}
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                      <button
                        onClick={() => message.trim() && addComment.mutate(message)}
                        disabled={!message.trim() || addComment.isPending}
                        className="self-end p-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-100 disabled:opacity-40 transition-colors"
                      >
                        {addComment.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5">Ctrl+Enter para enviar</p>
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
