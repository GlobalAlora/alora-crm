'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Send, MessageSquare, Phone, Mail, Calendar, ArrowRight, CheckSquare, Webhook, Pencil, Trash2, X, Check } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import type { Activity } from '@/types'
import { activitiesApi } from '@/lib/api'
import { timeAgo } from '@/lib/utils'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { RichTextEditor } from '@/components/shared/RichTextEditor'

const TYPE_ICON = {
  nota: MessageSquare,
  llamada: Phone,
  email: Mail,
  reunion: Calendar,
  cambio_estado: ArrowRight,
  tarea_completada: CheckSquare,
  webhook: Webhook,
  whatsapp: MessageSquare,
}

const TYPE_COLOR: Record<Activity['tipo'], string> = {
  nota: '#64748b',
  llamada: '#3b82f6',
  email: '#8b5cf6',
  reunion: '#f59e0b',
  cambio_estado: '#94a3b8',
  tarea_completada: '#22c55e',
  webhook: '#06b6d4',
  whatsapp: '#22c55e',
}

interface ActivityFeedProps {
  leadId: string
}

export function ActivityFeed({ leadId }: ActivityFeedProps) {
  const queryClient = useQueryClient()
  const [nota, setNota] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['activities', leadId],
    queryFn: () => activitiesApi.list(leadId),
    staleTime: 0,
  })

  const activities = data?.data ?? []

  const mutation = useMutation({
    mutationFn: () =>
      activitiesApi.create(leadId, { tipo: 'nota', descripcion: nota }),
    onSuccess: () => {
      setNota('')
      queryClient.invalidateQueries({ queryKey: ['activities', leadId] })
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
    },
    onError: () => toast.error('Error al agregar la nota'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nota.trim() || nota === '<p></p>') return
    mutation.mutate()
  }

  // Group by date
  const grouped = activities.reduce<Record<string, Activity[]>>((acc, act) => {
    const day = format(new Date(act.created_at), 'yyyy-MM-dd')
    if (!acc[day]) acc[day] = []
    acc[day].push(act)
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full">
      {/* Note input */}
      <form onSubmit={handleSubmit} className="p-4 border-b">
        <RichTextEditor
          content={nota}
          onChange={setNota}
          editable={true}
          minimal={true}
        />
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            disabled={!nota.trim() || nota === '<p></p>' || mutation.isPending}
            className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={13} />
            {mutation.isPending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </form>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        )}

        {Object.entries(grouped).map(([day, items]) => (
          <div key={day}>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              {format(new Date(day), "d 'de' MMMM", { locale: es })}
            </div>
            <div className="space-y-2">
              {items.map((act) => (
                <ActivityItem key={act.id} activity={act} leadId={leadId} />
              ))}
            </div>
          </div>
        ))}

        {!isLoading && activities.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">
            Aún no hay actividad registrada
          </p>
        )}
      </div>
    </div>
  )
}

function ActivityItem({ activity, leadId }: { activity: Activity; leadId: string }) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(activity.descripcion)

  const updateMutation = useMutation({
    mutationFn: () => activitiesApi.update(activity.id, { descripcion: editContent }),
    onSuccess: () => {
      setIsEditing(false)
      queryClient.invalidateQueries({ queryKey: ['activities', leadId] })
      toast.success('Nota actualizada')
    },
    onError: () => toast.error('Error al actualizar la nota'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => activitiesApi.delete(activity.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activities', leadId] })
      toast.success('Nota eliminada')
    },
    onError: () => toast.error('Error al eliminar la nota'),
  })

  const Icon = TYPE_ICON[activity.tipo] ?? MessageSquare
  const color = TYPE_COLOR[activity.tipo]
  const isNote = activity.tipo === 'nota'
  const isRichText = isNote && activity.descripcion.includes('<')

  return (
    <div className="flex gap-3">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon size={13} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        {isEditing && isNote ? (
          <div className="space-y-2">
            <RichTextEditor
              content={editContent}
              onChange={setEditContent}
              editable={true}
              minimal={true}
            />
            <div className="flex gap-2">
              <button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <Check size={12} />
                Guardar
              </button>
              <button
                onClick={() => {
                  setIsEditing(false)
                  setEditContent(activity.descripcion)
                }}
                className="flex items-center gap-1 text-xs text-slate-600 px-2 py-1 rounded hover:bg-slate-100"
              >
                <X size={12} />
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              {isRichText ? (
                <div
                  className="text-sm text-slate-700 leading-snug prose prose-sm max-w-none [&_a]:text-blue-600 [&_a]:underline [&_a]:cursor-pointer"
                  dangerouslySetInnerHTML={{ __html: activity.descripcion }}
                />
              ) : (
                <p className="text-sm text-slate-700 leading-snug">{activity.descripcion}</p>
              )}
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-xs text-slate-400 mt-0.5">
                  {timeAgo(activity.created_at)}
                </span>
                {isNote && (
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('¿Eliminar esta nota?')) {
                          deleteMutation.mutate()
                        }
                      }}
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-slate-100 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
            {activity.user && (
              <div className="flex items-center gap-1.5 mt-1">
                <UserAvatar name={activity.user.full_name} avatarUrl={activity.user.avatar_url} size="sm" />
                <span className="text-xs text-slate-400">{activity.user.full_name}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
