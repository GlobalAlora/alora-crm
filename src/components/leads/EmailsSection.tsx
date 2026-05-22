'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Mail, Loader2, Reply, ArrowDownLeft, ArrowUpRight, Trash2, Pencil, Check, X,
} from 'lucide-react'
import { activitiesApi } from '@/lib/api'
import { timeAgoWithFullDate } from '@/lib/utils'
import { RichTextEditor } from '@/components/shared/RichTextEditor'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Activity } from '@/types'

// ── Config ────────────────────────────────────────────────────────────────────

const SENDER_EMAIL_KEY = 'alora_email_sender'

const SENDERS = [
  { name: 'Bruno',      email: 'bruno@globalalora.com' },
  { name: 'Walo',       email: 'walo@globalalora.com'  },
  { name: 'Info Alora', email: 'info@globalalora.com'  },
] as const

type SenderEmail = typeof SENDERS[number]['email']

// ── Email item ────────────────────────────────────────────────────────────────

function EmailItem({
  activity,
  onDelete,
  onEdit,
  onReply,
}: {
  activity: Activity
  onDelete: (id: string) => void
  onEdit: (id: string, text: string) => void
  onReply?: (subject: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(activity.descripcion)
  const [editorKey, setEditorKey] = useState(0)

  const meta = activity.metadata as Record<string, string> | null
  const direction = meta?.direction ?? 'outbound'
  const subject   = meta?.subject   ?? '(sin asunto)'
  const from      = meta?.from      ?? ''
  const to        = meta?.to        ?? ''
  const isInbound = direction === 'inbound'

  const handleSave = () => {
    if (draft) { onEdit(activity.id, draft); setEditing(false) }
  }
  const handleCancel = () => {
    setDraft(activity.descripcion)
    setEditorKey(k => k + 1)
    setEditing(false)
  }

  return (
    <div className={cn(
      'rounded-xl border bg-white overflow-hidden transition-shadow hover:shadow-sm',
      isInbound ? 'border-purple-100' : 'border-slate-200'
    )}>
      {/* Header */}
      <div className={cn(
        'flex items-center gap-2 px-4 py-2.5 border-b text-xs font-medium',
        isInbound ? 'bg-purple-50 border-purple-100 text-purple-700' : 'bg-slate-50 border-slate-200 text-slate-600'
      )}>
        {isInbound
          ? <ArrowDownLeft size={13} className="text-purple-500 flex-shrink-0" />
          : <ArrowUpRight  size={13} className="text-slate-400 flex-shrink-0"  />}
        <span>{isInbound ? 'Recibido' : 'Enviado'}</span>
        <span className="mx-1 text-slate-300">·</span>
        <span className="truncate">{isInbound ? `De: ${from}` : `Para: ${to}`}</span>
        <span className="ml-auto flex-shrink-0 font-normal text-slate-400">
          {timeAgoWithFullDate(activity.created_at)}
        </span>
      </div>

      {/* Subject */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-sm font-semibold text-slate-800 truncate">{subject}</p>
      </div>

      {/* Body */}
      <div className="px-4 pb-3">
        {editing ? (
          <div className="space-y-2 mt-2">
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
                className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <Check size={11} /> Guardar
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 text-xs text-slate-500 px-2.5 py-1 rounded hover:bg-slate-100"
              >
                <X size={11} /> Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div
            className="prose prose-sm max-w-none text-slate-600 mt-1 overflow-x-hidden break-words line-clamp-6"
            dangerouslySetInnerHTML={{ __html: activity.descripcion }}
          />
        )}
      </div>

      {/* Footer */}
      {!editing && (
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-2">
            {activity.user && <UserAvatar user={activity.user} size="xs" showName />}
          </div>
          <div className="flex items-center gap-1">
            {isInbound && onReply && (
              <button
                onClick={() => onReply(`Re: ${subject}`)}
                className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium px-2 py-1 rounded hover:bg-purple-50 transition-colors"
              >
                <Reply size={11} /> Responder
              </button>
            )}
            <button
              onClick={() => setEditing(true)}
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => onDelete(activity.id)}
              className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface EmailsSectionProps {
  leadId:    string
  leadEmail?: string | null
}

export function EmailsSection({ leadId, leadEmail }: EmailsSectionProps) {
  const qc = useQueryClient()

  // ── Compose state ────────────────────────────────────────────────────────
  const [emailSubject, setEmailSubject] = useState('')
  const [text, setText] = useState('')
  const [editorKey, setEditorKey] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [fromEmail, setFromEmail] = useState<SenderEmail>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(SENDER_EMAIL_KEY) : null
    return (SENDERS.find(s => s.email === saved)?.email ?? SENDERS[0].email) as SenderEmail
  })

  const handleFromEmailChange = (email: SenderEmail) => {
    setFromEmail(email)
    if (typeof window !== 'undefined') localStorage.setItem(SENDER_EMAIL_KEY, email)
  }

  // ── Query (shares cache with UnifiedTimeline) ────────────────────────────
  const { data: activitiesData, isLoading } = useQuery({
    queryKey: ['activities', leadId],
    queryFn: () => activitiesApi.list(leadId),
    staleTime: 30_000,
  })

  const emails: Activity[] = (activitiesData?.data ?? []).filter(a => a.tipo === 'email')

  // ── Sync ────────────────────────────────────────────────────────────────
  const syncEmails = async (silent = false) => {
    if (!leadEmail) return
    if (!silent) setIsSyncing(true)
    try {
      const res  = await fetch(`/api/leads/${leadId}/sync-emails`, { method: 'POST' })
      const json = await res.json()
      if (json.synced > 0) {
        qc.invalidateQueries({ queryKey: ['activities', leadId] })
        if (!silent) toast.success(`${json.synced} email${json.synced > 1 ? 's' : ''} sincronizado${json.synced > 1 ? 's' : ''}`)
      } else if (!silent) {
        toast('Sin emails nuevos', { icon: '📭' })
      }
    } catch {
      if (!silent) toast.error('Error al sincronizar emails')
    } finally {
      if (!silent) setIsSyncing(false)
    }
  }

  // ── Mutations ────────────────────────────────────────────────────────────
  const sendEmail = useMutation({
    mutationFn: () =>
      fetch(`/api/leads/${leadId}/send-email`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          subject:   emailSubject,
          html:      text,
          fromEmail,
          fromName:  SENDERS.find(s => s.email === fromEmail)?.name ?? 'Alora',
        }),
      }).then(async r => {
        const j = await r.json()
        if (!r.ok || j.error) throw new Error(j.error ?? 'Error al enviar')
        return j
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['activities', leadId] })
      setText(''); setEmailSubject(''); setEditorKey(k => k + 1)
      toast.success(res.message ?? 'Email enviado')
      setTimeout(() => syncEmails(true), 3000)
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al enviar'),
  })

  const deleteActivity = useMutation({
    mutationFn: (id: string) => activitiesApi.delete(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['activities', leadId] }); toast.success('Eliminado') },
    onError:    () => toast.error('Error al eliminar'),
  })

  const editActivity = useMutation({
    mutationFn: ({ id, descripcion }: { id: string; descripcion: string }) =>
      activitiesApi.update(id, { descripcion }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities', leadId] }),
    onError:   () => toast.error('Error al guardar'),
  })

  // ── Reply handler ────────────────────────────────────────────────────────
  const composeRef = useRef<HTMLDivElement>(null)
  const handleReply = (subject: string) => {
    setEmailSubject(subject)
    composeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* ── Compose ─────────────────────────────────────────────────────── */}
      <div ref={composeRef} className="bg-slate-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nuevo email</span>
          {leadEmail && (
            <button
              onClick={() => syncEmails(false)}
              disabled={isSyncing}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border border-slate-200 bg-white text-slate-500 hover:border-purple-300 hover:text-purple-600 transition-all disabled:opacity-50"
            >
              {isSyncing
                ? <Loader2 size={11} className="animate-spin" />
                : <Mail size={11} />}
              Sincronizar
            </button>
          )}
        </div>

        {leadEmail ? (
          <>
            {/* From */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-12 shrink-0">De:</span>
              <select
                value={fromEmail}
                onChange={e => handleFromEmailChange(e.target.value as SenderEmail)}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white text-slate-700"
              >
                {SENDERS.map(s => (
                  <option key={s.email} value={s.email}>{s.name} — {s.email}</option>
                ))}
              </select>
            </div>

            {/* To */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-12 shrink-0">Para:</span>
              <span className="text-sm text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 bg-white flex-1 truncate">{leadEmail}</span>
            </div>

            {/* Subject */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-12 shrink-0">Asunto:</span>
              <input
                type="text"
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                placeholder="Asunto del email"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
              />
            </div>

            {/* Body */}
            <RichTextEditor
              key={editorKey}
              content=""
              onChange={setText}
              placeholder="Cuerpo del email..."
              minimal
            />

            {/* Send button */}
            <div className="flex justify-end">
              <button
                onClick={() => sendEmail.mutate()}
                disabled={sendEmail.isPending || !text || !emailSubject.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {sendEmail.isPending
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Mail size={13} />}
                Enviar email
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400 text-center py-2">
            Este lead no tiene email registrado.
          </p>
        )}
      </div>

      {/* ── Email list ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-slate-300" />
        </div>
      ) : emails.length === 0 ? (
        <div className="text-center py-10">
          <Mail size={28} className="mx-auto text-slate-200 mb-2" />
          <p className="text-sm text-slate-400">Sin emails registrados.</p>
          {leadEmail && (
            <p className="text-xs text-slate-300 mt-1">
              Usá el botón <strong>Sincronizar</strong> para traer emails de Gmail.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {emails.map(email => (
            <EmailItem
              key={email.id}
              activity={email}
              onDelete={id => deleteActivity.mutate(id)}
              onEdit={(id, descripcion) => editActivity.mutate({ id, descripcion })}
              onReply={leadEmail ? handleReply : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
