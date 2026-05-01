'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare, Phone, Mail, Users, ArrowRight, CheckSquare,
  Globe, MessageCircle, Plus, Loader2, Trash2, Pencil, Check, X
} from 'lucide-react'
import { activitiesApi } from '@/lib/api'
import { timeAgo } from '@/lib/utils'
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

function ActivityItem({ activity, onDelete, onEdit }: {
  activity: Activity
  onDelete: (id: string) => void
  onEdit: (id: string, text: string) => void
}) {
  const config = TIPO_CONFIG[activity.tipo] ?? TIPO_CONFIG.nota
  const Icon = config.icon
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(activity.descripcion)
  const [editorKey, setEditorKey] = useState(0)

  const isEditable = ['nota', 'llamada', 'email', 'reunion'].includes(activity.tipo)

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
              <div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: activity.descripcion }} />
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
        <div className="flex items-center gap-2 mt-1">
          {activity.user && (
            <UserAvatar user={activity.user} size="xs" showName />
          )}
          <span className="text-xs text-slate-400">{timeAgo(activity.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

interface ActivityFeedProps {
  leadId: string
}

export function ActivityFeed({ leadId }: ActivityFeedProps) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<typeof ACTIVITY_TYPES[number]>('nota')
  const [text, setText] = useState('')
  const [editorKey, setEditorKey] = useState(0)

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!text) return
    addMutation.mutate()
  }

  return (
    <div className="flex flex-col gap-4">
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
        <RichTextEditor
          key={editorKey}
          content=""
          onChange={setText}
          placeholder={`Agregar ${TIPO_CONFIG[tipo].label.toLowerCase()}...`}
          minimal
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!text || addMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {addMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Registrar
          </button>
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
