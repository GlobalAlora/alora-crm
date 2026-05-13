'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare, Phone, Mail, Users, ArrowRight, CheckSquare,
  Globe, MessageCircle, Plus, Loader2, Trash2, Pencil, Check, X,
  Clock, AlertCircle, Reply, CalendarCheck,
} from 'lucide-react'
import { format, isPast, isToday, isTomorrow } from 'date-fns'
import { es } from 'date-fns/locale'
import { activitiesApi } from '@/lib/api'
import { timeAgoWithFullDate } from '@/lib/utils'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { RichTextEditor } from '@/components/shared/RichTextEditor'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Activity, Task } from '@/types'

// ── Config ─────────────────────────────────────────────────────────────────────

const ACTIVITY_TYPES = ['nota', 'llamada', 'email', 'reunion'] as const
type ActivityInputType = typeof ACTIVITY_TYPES[number]

const TIPO_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  nota:             { icon: MessageSquare, color: 'bg-slate-100 text-slate-600',  label: 'Nota'        },
  llamada:          { icon: Phone,         color: 'bg-blue-50 text-blue-600',     label: 'Llamada'     },
  email:            { icon: Mail,          color: 'bg-purple-50 text-purple-600', label: 'Email'       },
  reunion:          { icon: Users,         color: 'bg-orange-50 text-orange-600', label: 'Reunión'     },
  cambio_estado:    { icon: ArrowRight,    color: 'bg-green-50 text-green-600',   label: 'Cambio'      },
  tarea_completada: { icon: CheckSquare,   color: 'bg-teal-50 text-teal-600',     label: 'Completada'  },
  webhook:          { icon: Globe,         color: 'bg-slate-50 text-slate-500',   label: 'Webhook'     },
  whatsapp:         { icon: MessageCircle, color: 'bg-green-50 text-green-600',   label: 'WhatsApp'    },
}

const SENDER_NAME_KEY = 'alora_email_sender_name'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDueDate(date: string): { label: string; status: 'overdue' | 'today' | 'soon' | 'future' } {
  const d = new Date(date)
  // Always use Argentina timezone for comparisons and display
  const ar = new Date(d.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const hasTime = ar.getHours() !== 0 || ar.getMinutes() !== 0
  const timeStr = hasTime ? ` ${format(ar, 'HH:mm')}` : ''
  const dateStr = format(ar, "d 'de' MMMM", { locale: es })

  if (isPast(ar) && !isToday(ar)) return { label: `Vencida · ${dateStr}${timeStr}`, status: 'overdue' }
  if (isToday(ar))                return { label: `${dateStr}${timeStr}`,            status: 'today'   }
  if (isTomorrow(ar))             return { label: `${dateStr}${timeStr}`,            status: 'soon'    }
  return                               { label: `${dateStr}${timeStr}`,            status: 'future'  }
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  // Always use Argentina timezone so the edit field shows the correct local time
  const ar = new Date(d.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${ar.getFullYear()}-${pad(ar.getMonth() + 1)}-${pad(ar.getDate())}T${pad(ar.getHours())}:${pad(ar.getMinutes())}`
}

// ── Task inline item ───────────────────────────────────────────────────────────

interface TaskItemProps {
  task: Task
  onComplete: () => void
  onUncomplete: () => void
  onDelete: () => void
  onUpdate: (data: Partial<Pick<Task, 'titulo' | 'vencimiento'>>) => void
  compact?: boolean
}

function TaskItem({ task, onComplete, onUncomplete, onDelete, onUpdate, compact = false }: TaskItemProps) {
  const [editing, setEditing] = useState(false)
  const [draftTitulo, setDraftTitulo] = useState(task.titulo)
  const [draftVenc, setDraftVenc] = useState(toDatetimeLocal(task.vencimiento))
  const due = task.vencimiento ? formatDueDate(task.vencimiento) : null

  const dueBadgeClass = due ? {
    overdue: 'text-red-600 bg-red-50',
    today:   'text-amber-600 bg-amber-50',
    soon:    'text-blue-600 bg-blue-50',
    future:  'text-slate-500 bg-slate-100',
  }[due.status] : ''

  const handleSave = () => {
    if (!draftTitulo.trim()) return
    onUpdate({ titulo: draftTitulo.trim(), vencimiento: draftVenc || undefined })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50 space-y-2">
        <input
          autoFocus
          value={draftTitulo}
          onChange={(e) => setDraftTitulo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
          className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
        <input
          type="datetime-local"
          value={draftVenc}
          onChange={(e) => setDraftVenc(e.target.value)}
          className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-700"
        />
        <div className="flex gap-1.5">
          <button onClick={handleSave} disabled={!draftTitulo.trim()} className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
            <Check size={11} /> Guardar
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-slate-500 px-2.5 py-1 rounded hover:bg-slate-200">
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'flex items-start gap-2.5 group rounded-lg transition-colors',
      compact ? 'p-2 hover:bg-slate-50' : 'p-2.5',
      task.completada && 'opacity-55'
    )}>
      {/* Checkbox */}
      <button
        onClick={task.completada ? onUncomplete : onComplete}
        title={task.completada ? 'Reabrir' : 'Completar'}
        className={cn(
          'w-4 h-4 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors',
          task.completada
            ? 'bg-emerald-500 border-emerald-500 hover:bg-emerald-600'
            : due?.status === 'overdue'
              ? 'border-red-400 hover:border-red-500 hover:bg-red-50'
              : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50'
        )}
      >
        {task.completada && (
          <svg viewBox="0 0 14 14" fill="none" className="w-full h-full p-0.5">
            <path d="M2 7l4 4 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm text-slate-700 leading-snug', task.completada && 'line-through text-slate-400')}>
          {task.titulo}
        </p>
        {due && (
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full mt-1', dueBadgeClass)}>
            {due.status === 'overdue' ? <AlertCircle size={10} /> : <Clock size={10} />}
            {due.label}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {!task.completada && (
          <button onClick={() => setEditing(true)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded">
            <Pencil size={12} />
          </button>
        )}
        <button onClick={onDelete} className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}

// ── Activity item ──────────────────────────────────────────────────────────────

function ActivityItem({
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
  const config = TIPO_CONFIG[activity.tipo] ?? TIPO_CONFIG.nota
  const Icon = config.icon
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(activity.descripcion)
  const [editorKey, setEditorKey] = useState(0)

  const isEditable = ['nota', 'llamada', 'email', 'reunion'].includes(activity.tipo)
  const isInbound = activity.tipo === 'email' && activity.metadata?.direction === 'inbound'
  const inboundSubject = (activity.metadata?.subject as string | undefined) ?? ''

  const handleSave = () => { if (draft) { onEdit(activity.id, draft); setEditing(false) } }
  const handleCancel = () => { setDraft(activity.descripcion); setEditorKey(k => k + 1); setEditing(false) }

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
                <RichTextEditor key={editorKey} content={activity.descripcion} onChange={setDraft} placeholder="Editá el contenido..." minimal />
                <div className="flex gap-1.5">
                  <button onClick={handleSave} disabled={!draft} className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
                    <Check size={11} /> Guardar
                  </button>
                  <button onClick={handleCancel} className="flex items-center gap-1 text-xs text-slate-500 px-2.5 py-1 rounded hover:bg-slate-100">
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
              <button onClick={() => setEditing(true)} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"><Pencil size={12} /></button>
              <button onClick={() => onDelete(activity.id)} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={12} /></button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {activity.user && <UserAvatar user={activity.user} size="xs" showName />}
          <span className="text-xs text-slate-400">{timeAgoWithFullDate(activity.created_at)}</span>
          {isInbound && onReply && (
            <button onClick={() => onReply(`Re: ${inboundSubject}`)} className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700 font-medium ml-1">
              <Reply size={11} /> Responder
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface UnifiedTimelineProps {
  leadId: string
  leadEmail?: string | null
}

export function UnifiedTimeline({ leadId, leadEmail }: UnifiedTimelineProps) {
  const qc = useQueryClient()
  const qcRef = useRef(qc)
  qcRef.current = qc

  // ── Compose state ────────────────────────────────────────────────────────────
  const [inputType, setInputType] = useState<ActivityInputType | 'tarea'>('nota')
  const [text, setText] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [taskTitulo, setTaskTitulo] = useState('')
  const [taskVencimiento, setTaskVencimiento] = useState('')
  const [fromName, setFromName] = useState(() =>
    (typeof window !== 'undefined' ? localStorage.getItem(SENDER_NAME_KEY) : null) ?? 'Alora CRM'
  )
  const [editorKey, setEditorKey] = useState(0)
  const [showDone, setShowDone] = useState(false)

  const handleFromNameChange = (v: string) => {
    setFromName(v)
    if (typeof window !== 'undefined') localStorage.setItem(SENDER_NAME_KEY, v)
  }

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: activitiesData, isLoading: loadingActivities } = useQuery({
    queryKey: ['activities', leadId],
    queryFn: () => activitiesApi.list(leadId),
    staleTime: 30_000,
  })

  const { data: tasksData = [], isLoading: loadingTasks } = useQuery<Task[]>({
    queryKey: ['tasks', leadId],
    queryFn: async () => {
      const r = await fetch(`/api/leads/${leadId}/tasks`)
      if (!r.ok) throw new Error('Failed to fetch tasks')
      const json = await r.json()
      return json.data ?? []
    },
    staleTime: 0,
  })

  const activities: Activity[] = activitiesData?.data ?? []
  const pendingTasks = tasksData.filter(t => !t.completada)
  const doneTasks = tasksData.filter(t => t.completada)

  // ── Realtime ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/activities/read-inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId }),
    }).then(() => { qcRef.current.invalidateQueries({ queryKey: ['notifications'] }) }).catch(() => {})
  }, [leadId])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`unified:lead:${leadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities', filter: `lead_id=eq.${leadId}` }, (payload) => {
        const meta = (payload.new as { metadata?: Record<string, unknown> }).metadata
        if (meta?.direction === 'inbound') {
          const subject = (meta.subject as string | undefined) ?? 'nuevo email'
          toast(`📬 Respuesta recibida: ${subject}`, { duration: 6000 })
        }
        qcRef.current.invalidateQueries({ queryKey: ['activities', leadId] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leadId])

  // ── Activity mutations ───────────────────────────────────────────────────────
  const addActivity = useMutation({
    mutationFn: () => activitiesApi.create(leadId, { tipo: inputType as ActivityInputType, descripcion: text.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities', leadId] }); setText(''); setEditorKey(k => k + 1); toast.success('Actividad registrada') },
    onError: () => toast.error('Error al guardar'),
  })

  const deleteActivity = useMutation({
    mutationFn: (id: string) => activitiesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities', leadId] }); toast.success('Eliminado') },
    onError: () => toast.error('Error al eliminar'),
  })

  const editActivity = useMutation({
    mutationFn: ({ id, descripcion }: { id: string; descripcion: string }) => activitiesApi.update(id, { descripcion }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities', leadId] }),
    onError: () => toast.error('Error al guardar'),
  })

  const sendEmail = useMutation({
    mutationFn: () =>
      fetch(`/api/leads/${leadId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: emailSubject, html: text, fromName }),
      }).then(async r => { const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error ?? 'Error al enviar'); return j }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['activities', leadId] })
      setText(''); setEmailSubject(''); setEditorKey(k => k + 1)
      toast.success(res.message ?? 'Email enviado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al enviar'),
  })

  // ── Task mutations ───────────────────────────────────────────────────────────
  const createTask = useMutation({
    mutationFn: () =>
      fetch(`/api/leads/${leadId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: taskTitulo, vencimiento: taskVencimiento }),
      }).then(r => { if (!r.ok) throw new Error('Error al crear'); return r.json() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', leadId] })
      setTaskTitulo(''); setTaskVencimiento('')
      toast.success('Tarea creada')
    },
    onError: () => toast.error('Error al crear tarea'),
  })

  const taskMutation = (url: string, method = 'PATCH') => async () => {
    const r = await fetch(url, { method })
    if (!r.ok) throw new Error('Error')
    return r.json()
  }

  const completeTask = useMutation({
    mutationFn: (id: string) => taskMutation(`/api/leads/${leadId}/tasks/${id}/complete`)(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', leadId] }); toast.success('Tarea completada') },
    onError: () => toast.error('Error'),
  })

  const uncompleteTask = useMutation({
    mutationFn: (id: string) => taskMutation(`/api/leads/${leadId}/tasks/${id}/uncomplete`)(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', leadId] }); toast.success('Tarea reabierta') },
    onError: () => toast.error('Error'),
  })

  const updateTask = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<Task, 'titulo' | 'vencimiento'>> }) =>
      fetch(`/api/leads/${leadId}/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error('Error'); return r.json() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', leadId] }); toast.success('Actualizada') },
    onError: () => toast.error('Error'),
  })

  const deleteTask = useMutation({
    mutationFn: (id: string) => fetch(`/api/leads/${leadId}/tasks/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error('Error'); return r.json() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', leadId] }); toast.success('Eliminada') },
    onError: () => toast.error('Error'),
  })

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleReply = (subject: string) => {
    setInputType('email')
    setEmailSubject(subject)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputType === 'tarea') {
      if (!taskTitulo.trim()) return
      createTask.mutate()
    } else if (inputType === 'email') {
      if (!emailSubject.trim()) { toast.error('Escribí el asunto del email'); return }
      if (!text) { toast.error('El cuerpo del email no puede estar vacío'); return }
      sendEmail.mutate()
    } else {
      if (!text) return
      addActivity.mutate()
    }
  }

  const isSubmitting = addActivity.isPending || sendEmail.isPending || createTask.isPending

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 overflow-x-hidden">

      {/* ── Pending tasks strip ──────────────────────────────────────────────── */}
      {(loadingTasks || pendingTasks.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-amber-200/70">
            <span className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
              <CalendarCheck size={13} />
              Tareas pendientes
              {pendingTasks.length > 0 && (
                <span className="bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pendingTasks.length}</span>
              )}
            </span>
            <button
              onClick={() => setInputType('tarea')}
              className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 font-medium"
            >
              <Plus size={12} /> Nueva
            </button>
          </div>
          {loadingTasks ? (
            <div className="p-3 space-y-1.5">
              {[1,2].map(i => <div key={i} className="h-7 bg-amber-100 rounded animate-pulse" />)}
            </div>
          ) : pendingTasks.length === 0 ? (
            <p className="text-xs text-amber-600 px-3 py-2.5">Sin tareas pendientes 🎉</p>
          ) : (
            <div className="divide-y divide-amber-100">
              {pendingTasks.map(task => (
                <div key={task.id} className="px-2">
                  <TaskItem
                    task={task}
                    compact
                    onComplete={() => completeTask.mutate(task.id)}
                    onUncomplete={() => uncompleteTask.mutate(task.id)}
                    onDelete={() => { if (confirm('¿Eliminar esta tarea?')) deleteTask.mutate(task.id) }}
                    onUpdate={(data) => updateTask.mutate({ id: task.id, data })}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Compose area ────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="bg-slate-50 rounded-xl p-4 space-y-3">
        {/* Type selector */}
        <div className="flex gap-1.5 flex-wrap">
          {([...ACTIVITY_TYPES, 'tarea'] as const).map((t) => {
            const cfg = t === 'tarea'
              ? { icon: CheckSquare, label: 'Tarea' }
              : TIPO_CONFIG[t]
            const Icon = cfg.icon
            return (
              <button
                key={t}
                type="button"
                onClick={() => setInputType(t)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                  inputType === t
                    ? t === 'tarea'
                      ? 'bg-amber-500 border-amber-500 text-white'
                      : 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                )}
              >
                <Icon size={11} />
                {cfg.label}
              </button>
            )
          })}
        </div>

        {/* Email fields */}
        {inputType === 'email' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-12 shrink-0">De:</span>
              <input type="text" value={fromName} onChange={e => handleFromNameChange(e.target.value)} placeholder="Tu nombre" className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-12 shrink-0">Asunto:</span>
              <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Asunto del email" className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white" />
            </div>
          </div>
        )}

        {/* Task form */}
        {inputType === 'tarea' ? (
          <div className="space-y-2">
            <input
              autoFocus
              value={taskTitulo}
              onChange={e => setTaskTitulo(e.target.value)}
              placeholder="Título de la tarea"
              onKeyDown={e => { if (e.key === 'Enter' && taskTitulo.trim()) createTask.mutate() }}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
            />
            <div>
              <span className="text-xs text-slate-500 mb-1 block">Fecha y hora de vencimiento (opcional)</span>
              <input
                type="datetime-local"
                value={taskVencimiento}
                onChange={e => setTaskVencimiento(e.target.value)}
                step="60"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white text-slate-600"
              />
            </div>
          </div>
        ) : (
          <RichTextEditor
            key={editorKey}
            content=""
            onChange={setText}
            placeholder={inputType === 'email' ? 'Cuerpo del email...' : `Agregar ${TIPO_CONFIG[inputType]?.label?.toLowerCase() ?? 'nota'}...`}
            minimal
          />
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          {inputType === 'email' && leadEmail ? (
            <span className="text-xs text-slate-400 flex items-center gap-1"><Mail size={11} /> Para: {leadEmail}</span>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {inputType === 'email' && leadEmail && (
              <button
                type="button"
                onClick={() => sendEmail.mutate()}
                disabled={isSubmitting || !text || !emailSubject}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {sendEmail.isPending ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                Enviar email
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting || (inputType === 'tarea' ? !taskTitulo.trim() : !text)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors',
                inputType === 'tarea' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {inputType === 'email' ? 'Solo registrar' : inputType === 'tarea' ? 'Crear tarea' : 'Registrar'}
            </button>
          </div>
        </div>
      </form>

      {/* ── Timeline ─────────────────────────────────────────────────────────── */}
      {(loadingActivities || loadingTasks) ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-slate-300" />
        </div>
      ) : activities.length === 0 && doneTasks.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Sin actividad registrada.</p>
      ) : (
        <div className="space-y-4">
          {/* Activity items */}
          {activities.map(a => (
            <ActivityItem
              key={a.id}
              activity={a}
              onDelete={id => deleteActivity.mutate(id)}
              onEdit={(id, descripcion) => editActivity.mutate({ id, descripcion })}
              onReply={leadEmail ? handleReply : undefined}
            />
          ))}

          {/* Completed tasks — collapsible */}
          {doneTasks.length > 0 && (
            <div className="border-t pt-4">
              <button
                onClick={() => setShowDone(v => !v)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 font-medium mb-3 transition-colors"
              >
                <CheckSquare size={12} />
                {showDone ? 'Ocultar' : 'Mostrar'} tareas completadas ({doneTasks.length})
              </button>
              {showDone && (
                <div className="space-y-1">
                  {doneTasks.slice(0, 10).map(task => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      compact
                      onComplete={() => completeTask.mutate(task.id)}
                      onUncomplete={() => uncompleteTask.mutate(task.id)}
                      onDelete={() => { if (confirm('¿Eliminar esta tarea?')) deleteTask.mutate(task.id) }}
                      onUpdate={data => updateTask.mutate({ id: task.id, data })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
