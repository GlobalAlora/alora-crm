'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare, Phone, Mail, Users, ArrowRight, CheckSquare,
  Globe, MessageCircle, Plus, Loader2, Trash2, Pencil, Check, X, Reply
} from 'lucide-react'
import { activitiesApi } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { timeAgoWithFullDate } from '@/lib/utils'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { RichTextEditor } from '@/components/shared/RichTextEditor'

import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Activity } from '@/types'

const TIPO_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  nota:             { icon: MessageSquare, color: 'bg-slate-100 text-slate-600', label: 'Nota' },
  llamada:          { icon: Phone,         color: 'bg-blue-50 text-blue-600',    label: 'Llamada' },
  email:            { icon: Mail,          color: 'bg-purple-50 text-purple-600',label: 'Email' },
  reunion:          { icon: Users,         color: 'bg-orange-50 text-orange-600',label: 'Reunión' },
  cambio_estado:    { icon: ArrowRight,    color: 'bg-green-50 text-green-600',  label: 'Cambio de estado' },
  tarea_completada: { icon: CheckSquare,   color: 'bg-teal-50 text-teal-600',    label: 'Tarea completada' },
  webhook:          { icon: Globe,         color: 'bg-slate-50 text-slate-500',  label: 'Webhook' },
  whatsapp:         { icon: MessageCircle, color: 'bg-green-50 text-green-600',  label: 'WhatsApp' },
}

const ACTIVITY_TYPES = ['nota', 'llamada', 'email', 'reunion'] as const

function ActivityItem({ activity, onDelete, onEdit, onReply }: {
  activity: Activity
  onDelete: (id: string) => void
  onEdit: (id: string, text: string) => void
  onReply?: (subject: string) => void
}) {
  const config = TIPO_CONFIG[activity.tipo] ?? TIPO_CONFIG.nota
  const Icon = config.icon
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(activity.descripcion)
  const [editorKey, setEditorKey] = useState(0)

  const isEditable = ['nota', 'llamada', 'email', 'reunion'].includes(activity.tipo)
  const isInbound = activity.tipo === 'email' && activity.metadata?.direction === 'inbound'
  const inboundSubject = (activity.metadata?.subject as string | undefined) ?? ''

  const handleSave = () => {
    if (draft) {
      onEdit(activity.id, draft)
      setEditing(false)
    }
  }

  const handleCancel = () => {
    setDraft(activity.descripcion)
    setEditorKey((k) => k + 1)
    setEditing(false)
  }

  return (
    <div className="flex gap-3 group">
      <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', config.color)}>
        <Icon size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <RichTextEditor
                  key={editorKey}
                  content={activity.descripcion}
                  onChange={setDraft}
                  placeholder="Editá el contenido..."
                  minimal
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={handleSave}
                    disabled={!draft}
                    className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <Check size={11} /> Guardar
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1 text-xs text-slate-500 px-2.5 py-1 rounded hover:bg-slate-100 transition-colors"
                  >
                    <X size={11} /> Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none text-slate-700 overflow-x-hidden break-words" dangerouslySetInnerHTML={{ __html: activity.descripcion }} />
            )}
          </div>
          {!editing && isEditable && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                onClick={() => setEditing(true)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={() => onDelete(activity.id)}
                className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {activity.user && (
            <UserAvatar user={activity.user} size="xs" showName />
          )}
          <span className="text-xs text-slate-400">{timeAgoWithFullDate(activity.created_at)}</span>
          {isInbound && onReply && (
            <button
              onClick={() => onReply(`Re: ${inboundSubject}`)}
              className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium ml-1"
            >
              <Reply size={11} /> Responder
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface ActivityFeedProps {
  leadId: string
  leadEmail?: string | null
}

const SENDER_NAME_KEY = 'alora_email_sender_name'

export function ActivityFeed({ leadId, leadEmail }: ActivityFeedProps) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<typeof ACTIVITY_TYPES[number]>('nota')
  const [text, setText] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [fromName, setFromName] = useState(() =>
    (typeof window !== 'undefined' ? localStorage.getItem(SENDER_NAME_KEY) : null) ?? 'Alora CRM'
  )
  const [editorKey, setEditorKey] = useState(0)

  const handleFromNameChange = (v: string) => {
    setFromName(v)
    if (typeof window !== 'undefined') localStorage.setItem(SENDER_NAME_KEY, v)
  }

  // Real-time: toast + refresh when lead replies via email
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`activities:lead:${leadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activities', filter: `lead_id=eq.${leadId}` },
        (payload) => {
          const meta = (payload.new as { metadata?: Record<string, unknown> }).metadata
          if (meta?.direction === 'inbound') {
            const subject = (meta.subject as string | undefined) ?? 'nuevo email'
            toast(`📬 Respuesta recibida: ${subject}`, { duration: 6000 })
          }
          qc.invalidateQueries({ queryKey: ['activities', leadId] })
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leadId, qc])

  const handleReply = (subject: string) => {
    setTipo('email')
    setEmailSubject(subject)
    // Scroll to top of form
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['activities', leadId],
    queryFn: () => activitiesApi.list(leadId),
    staleTime: 30_000,
  })

  const activities = data?.data ?? []

  const addMutation = useMutation({
    mutationFn: () => activitiesApi.create(leadId, { tipo, descripcion: text.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', leadId] })
      setText('')
      setEditorKey((k) => k + 1)
      toast.success('Actividad registrada')
    },
    onError: () => toast.error('Error al guardar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => activitiesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', leadId] })
      toast.success('Eliminado')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, descripcion }: { id: string; descripcion: string }) =>
      activitiesApi.update(id, { descripcion }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', leadId] })
    },
    onError: () => toast.error('Error al guardar'),
  })

  const sendEmailMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/leads/${leadId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: emailSubject, html: text, fromName }),
      }).then(async (r) => {
        const json = await r.json()
        if (!r.ok || json.error) throw new Error(json.error ?? 'Error al enviar')
        return json
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['activities', leadId] })
      setText('')
      setEmailSubject('')
      setEditorKey((k) => k + 1)
      toast.success(res.message ?? 'Email enviado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al enviar'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text) return
    addMutation.mutate()
  }

  const handleSendEmail = () => {
    if (!emailSubject.trim()) { toast.error('Escribí el asunto del email'); return }
    if (!text) { toast.error('El cuerpo del email no puede estar vacío'); return }
    sendEmailMutation.mutate()
  }

  return (
    <div className="flex flex-col gap-4 overflow-x-hidden">
      {/* Add activity form */}
      <form onSubmit={handleSubmit} className="bg-slate-50 rounded-xl p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {ACTIVITY_TYPES.map((t) => {
            const cfg = TIPO_CONFIG[t]
            const Icon = cfg.icon
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                  tipo === t
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                )}
              >
                <Icon size={11} />
                {cfg.label}
              </button>
            )
          })}
        </div>
        {/* Email compose fields */}
        {tipo === 'email' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-12 shrink-0">De:</span>
              <input
                type="text"
                value={fromName}
                onChange={(e) => handleFromNameChange(e.target.value)}
                placeholder="Tu nombre"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-12 shrink-0">Asunto:</span>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Asunto del email"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
              />
            </div>
          </div>
        )}

        <RichTextEditor
          key={editorKey}
          content=""
          onChange={setText}
          placeholder={tipo === 'email' ? 'Cuerpo del email...' : `Agregar ${TIPO_CONFIG[tipo].label.toLowerCase()}...`}
          minimal
        />

        <div className="flex items-center justify-between gap-2">
          {tipo === 'email' && leadEmail ? (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Mail size={11} /> Para: {leadEmail}
            </span>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {tipo === 'email' && leadEmail && (
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sendEmailMutation.isPending || !text || !emailSubject}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {sendEmailMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                Enviar email
              </button>
            )}
            <button
              type="submit"
              disabled={!text || addMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {addMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {tipo === 'email' ? 'Solo registrar' : 'Registrar'}
            </button>
          </div>
        </div>
      </form>

      {/* Feed */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-slate-300" />
        </div>
      )}
      {!isLoading && activities.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">Sin actividad registrada.</p>
      )}
      {!isLoading && activities.length > 0 && (
        <div className="space-y-4">
          {activities.map((a) => (
            <ActivityItem
              key={a.id}
              activity={a}
              onDelete={(id) => deleteMutation.mutate(id)}
              onEdit={(id, descripcion) => editMutation.mutate({ id, descripcion })}
              onReply={leadEmail ? handleReply : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
