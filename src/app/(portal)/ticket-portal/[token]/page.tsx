'use client'

import { useState, use, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, CheckCircle2, Clock, AlertCircle, Loader2, Paperclip, FileVideo, X } from 'lucide-react'
import type { TicketEstado } from '@/types'
import { extraHourPrice, formatARS } from '@/lib/utils'

type UploadedFile = { url: string; name: string; type: string }

// ─── helpers ───────────────────────────────────────────────

const ESTADO_CONFIG: Record<TicketEstado, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  nuevo:           { label: 'Nuevo',            color: '#3b82f6', bg: '#eff6ff',  icon: AlertCircle  },
  en_progreso:     { label: 'En progreso',      color: '#f59e0b', bg: '#fffbeb',  icon: Clock        },
  en_espera:       { label: 'En espera',        color: '#f97316', bg: '#fff7ed',  icon: Clock        },
  estimacion:      { label: 'Estimación',        color: '#8b5cf6', bg: '#f5f3ff',  icon: Clock        },
  resuelto:        { label: 'Resuelto',         color: '#22c55e', bg: '#f0fdf4',  icon: CheckCircle2 },
  cerrado:         { label: 'Cerrado',          color: '#94a3b8', bg: '#f8fafc',  icon: CheckCircle2 },
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
  categoria: string | null
  horas_estimadas: number | null
  horas_aprobadas: boolean | null
  created_at: string
  resolved_at: string | null
  client_nombre: string | null
  color_acento: string | null
  logo_url: string | null
  is_admin_preview: boolean
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
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!lightboxUrl) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxUrl(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxUrl])

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

  const [approvingHours, setApprovingHours] = useState(false)
  const [rejectingHours, setRejectingHours] = useState(false)

  const { data: res, isLoading, error: fetchErr, refetch } = useQuery<{ data: PortalTicket; error?: string }>({
    queryKey: ['portal-ticket', token],
    queryFn: () => fetch(`/api/portal/tickets/${token}`).then(r => r.json()),
    refetchInterval: 30_000,
  })

  const { data: hoursRes } = useQuery<{ data: { plan_horas_mensual: number; horas_restantes: number; horas_consumidas: number; porcentaje: number } | null }>({
    queryKey: ['portal-hours-mini'],
    queryFn: () => fetch('/api/portal/hours').then(r => r.json()).then(j => ({ data: j.data ? { plan_horas_mensual: j.data.plan_horas_mensual, horas_restantes: j.data.horas_restantes, horas_consumidas: j.data.horas_consumidas, porcentaje: j.data.porcentaje } : null })),
    enabled: true,
  })

  async function handleApproveHours() {
    setApprovingHours(true)
    try {
      await fetch(`/api/portal/tickets/${token}/approve-hours`, { method: 'POST' })
      await refetch()
    } finally {
      setApprovingHours(false)
    }
  }

  async function handleRejectHours() {
    setRejectingHours(true)
    try {
      await fetch(`/api/portal/tickets/${token}/approve-hours`, { method: 'DELETE' })
      await refetch()
    } finally {
      setRejectingHours(false)
    }
  }

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
  const isClosed        = ticket && ['resuelto', 'cerrado'].includes(ticket.estado)
  const isAdminPreview  = ticket?.is_admin_preview ?? false
  const headerBg        = ticket?.color_acento ?? '#0f172a'
  const needsHoursApproval = ticket && ticket.horas_estimadas != null && !ticket.horas_aprobadas && !isClosed

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header style={{ background: headerBg, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {ticket?.logo_url
              ? <img src={ticket.logo_url} alt="Logo" style={{ height: 32, objectFit: 'contain', maxWidth: 120 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              : <img src="/logo-nav-white.png" alt="Alora" style={{ height: 32, display: 'block', objectFit: 'contain' }} />
            }
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Seguimiento</span>
          </div>
          {ticket && (
            <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{ticket.numero}</span>
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
              <a href="/dashboard" className="text-blue-500 text-sm hover:underline mt-2 inline-block">Volver al portal</a>
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
                    {ticket.horas_estimadas != null && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        ⏱ {ticket.horas_estimadas} hs estimadas
                        {ticket.horas_aprobadas && <span className="ml-2 text-green-600 font-semibold">· Aprobadas ✓</span>}
                      </p>
                    )}
                  </div>
                </div>

                {ticket.descripcion && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{ticket.descripcion}</p>
                  </div>
                )}
              </div>

              {/* Hours approval banner */}
              {needsHoursApproval && (() => {
                const hours      = hoursRes?.data
                const plan       = hours?.plan_horas_mensual ?? 0
                const restantes  = hours?.horas_restantes ?? 0
                const estimadas  = ticket.horas_estimadas ?? 0
                const excede     = plan > 0 && estimadas > restantes
                const sobrante   = plan > 0 ? restantes - estimadas : null

                return (
                  <div style={{ background: '#fffbeb', border: `1px solid ${excede ? '#fca5a5' : '#fde68a'}`, borderRadius: 16, padding: '20px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <div style={{ fontSize: 24, lineHeight: 1 }}>⏱</div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#92400e', margin: '0 0 4px' }}>
                          Alora estimó {estimadas} hs para esta tarea
                        </p>
                        <p style={{ fontSize: 13, color: '#78350f', margin: '0 0 12px', lineHeight: 1.5 }}>
                          Necesitamos tu aprobación para asignar estas horas a tu plan mensual. Si tenés dudas, escribinos en la conversación.
                        </p>

                        {/* Plan hours context */}
                        {plan > 0 && hours && (
                          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: excede ? '#fef2f2' : '#f0fdf4', border: `1px solid ${excede ? '#fca5a5' : '#bbf7d0'}` }}>
                            {excede ? (
                              <>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', margin: '0 0 4px' }}>
                                  ⚠️ Esta estimación supera tu plan disponible
                                </p>
                                <p style={{ fontSize: 12, color: '#b91c1c', margin: 0, lineHeight: 1.5 }}>
                                  Tenés <strong>{restantes} hs</strong> restantes de tu plan de {plan} hs, pero esta tarea requiere <strong>{estimadas} hs</strong>.{' '}
                                  La{(estimadas - restantes) !== 1 ? 's' : ''} <strong>{(estimadas - restantes).toFixed((estimadas - restantes) % 1 === 0 ? 0 : 1)} hs adicional{(estimadas - restantes) !== 1 ? 'es' : ''}</strong> se facturarán por separado al precio vigente de <strong>{formatARS(extraHourPrice())} / hora</strong>.
                                </p>
                              </>
                            ) : (
                              <>
                                <p style={{ fontSize: 12, color: '#15803d', margin: '0 0 2px', fontWeight: 600 }}>
                                  ✓ Dentro de tu plan disponible
                                </p>
                                <p style={{ fontSize: 12, color: '#166534', margin: 0 }}>
                                  Tenés <strong>{restantes} hs</strong> disponibles. Al aprobar te quedarán <strong>{sobrante! >= 0 ? sobrante!.toFixed(sobrante! % 1 === 0 ? 0 : 1) : 0} hs</strong> para el resto del mes.
                                </p>
                              </>
                            )}
                          </div>
                        )}

                        {/* Approve / Reject buttons */}
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            onClick={handleApproveHours}
                            disabled={approvingHours || rejectingHours}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 8,
                              padding: '10px 20px', borderRadius: 10, border: 'none',
                              background: approvingHours ? '#94a3b8' : '#16a34a',
                              color: '#fff', fontSize: 13, fontWeight: 700,
                              cursor: (approvingHours || rejectingHours) ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {approvingHours
                              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Aprobando...</>
                              : <>✓ Aprobar ticket</>
                            }
                          </button>
                          <button
                            onClick={handleRejectHours}
                            disabled={approvingHours || rejectingHours}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 8,
                              padding: '10px 20px', borderRadius: 10,
                              border: '1.5px solid #dc2626',
                              background: 'transparent',
                              color: '#dc2626', fontSize: 13, fontWeight: 700,
                              cursor: (approvingHours || rejectingHours) ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {rejectingHours
                              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Rechazando...</>
                              : <>✕ Rechazar ticket</>
                            }
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

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
                              <button key={i} onClick={() => setLightboxUrl(a.url)} className="cursor-zoom-in">
                                <img src={a.url} alt={a.name} className="h-24 w-24 object-cover rounded-xl border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity" />
                              </button>
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
                {isAdminPreview ? (
                  <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-amber-50/60 dark:bg-amber-950/30 text-center">
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                      👁 Vista previa como cliente — para responder usá el CRM
                    </p>
                  </div>
                ) : !isClosed ? (
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
                    <a href="/nuevo" className="text-blue-500 text-xs hover:underline mt-1 inline-block">Abrir un nuevo ticket →</a>
                  </div>
                )}
              </div>
            </>
          )}

          <p className="text-center text-xs text-slate-400 dark:text-slate-600 pb-4">
            Alora Digital · <a href="https://globalalora.com" className="hover:text-slate-600 dark:hover:text-slate-400 transition-colors">globalalora.com</a>
          </p>
          <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
        </div>
      </main>

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
