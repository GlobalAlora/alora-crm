'use client'

import { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, DollarSign, CheckSquare, GripVertical, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Lead, Task, Propuesta, User } from '@/types'
import { cn, timeAgo, hoursSince } from '@/lib/utils'
import { UserAvatar } from '@/components/shared/UserAvatar'

interface LeadCardProps {
  lead: Lead
  onClick: (lead: Lead) => void
}

function useTasksCount(leadId: string) {
  const { data } = useQuery({
    queryKey: ['tasks-count', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/tasks`)
      if (!res.ok) return { data: [] }
      return res.json() as Promise<{ data: Task[] }>
    },
    staleTime: 60_000,
    enabled: !!leadId,
  })
  const tasks = data?.data ?? []
  const pendingCount = tasks.filter((t: Task) => !t.completada).length
  return pendingCount
}

function usePropuestasSummary(leadId: string) {
  const { data } = useQuery({
    queryKey: ['propuestas-count', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/propuestas`)
      if (!res.ok) return { data: [] }
      return res.json() as Promise<{ data: Propuesta[] }>
    },
    staleTime: 60_000,
    enabled: !!leadId,
  })
  const propuestas = data?.data ?? []
  const count = propuestas.length
  const totalUSD = propuestas.reduce((sum, p) => sum + (p.valor_usd || 0), 0)
  const totalARS = propuestas.reduce((sum, p) => sum + (p.valor_ars || 0), 0)
  return { count, totalUSD, totalARS }
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const queryClient = useQueryClient()
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { lead } })

  const pendingTasksCount = useTasksCount(lead.id)
  const propuestasSummary = usePropuestasSummary(lead.id)

  // Fetch users for responsable picker
  const { data: usersData } = useQuery<{ data: User[] }>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/users')
      if (!res.ok) return { data: [] }
      return res.json()
    },
    staleTime: 5 * 60_000,
  })
  const users = usersData?.data ?? []

  const updateResponsableMutation = useMutation({
    mutationFn: async (userId: string | null) => {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responsable_id: userId }),
      })
      if (!res.ok) throw new Error('Error al actualizar responsable')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const sinRespuesta = lead.stage_updated_at
    ? hoursSince(lead.stage_updated_at) > 48 &&
      (lead.estado_pipeline === 'lead_contactado' || lead.estado_pipeline === 'sin_respuesta')
    : false

  const valorNum = lead.valor_propuesta_moneda === 'ARS'
    ? (lead.valor_propuesta_ars ?? 0) / 1000  // rough USD equiv for high-value check
    : (lead.valor_propuesta_usd ?? 0)
  const isHighValue = valorNum >= 5000

  const valorLabel = (() => {
    if (lead.valor_propuesta_moneda === 'ARS' && lead.valor_propuesta_ars != null)
      return `ARS ${lead.valor_propuesta_ars.toLocaleString('es-AR')}`
    if (lead.valor_propuesta_usd != null) {
      return `USD ${lead.valor_propuesta_usd.toLocaleString('en-US')}`
    }
    return null
  })()

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-white rounded-lg border shadow-sm p-4 cursor-pointer select-none group min-h-[140px]',
        'hover:shadow-md transition-shadow',
        sinRespuesta && 'border-l-4 border-l-red-400',
        isDragging && 'shadow-xl rotate-1'
      )}
      onClick={() => onClick(lead)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {lead.empresa && (
            <p className="text-xs text-slate-500 truncate mb-1">{lead.empresa}</p>
          )}
          <p className="text-sm font-semibold text-slate-900 truncate">
            {[lead.nombre, lead.apellido].filter(Boolean).join(' ')}
          </p>
          {(lead.servicios_interesados?.length > 0) ? (
            <p className="text-xs text-slate-500 truncate mt-0.5">{lead.servicios_interesados[0]}{lead.servicios_interesados.length > 1 ? ` +${lead.servicios_interesados.length - 1}` : ''}</p>
          ) : lead.servicio_interesado ? (
            <p className="text-xs text-slate-500 truncate mt-0.5">{lead.servicio_interesado}</p>
          ) : null}
        </div>
        <div
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-0.5 text-slate-300 hover:text-slate-500 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {lead.email && (
          <p className="text-xs text-slate-600 truncate">{lead.email}</p>
        )}
        {lead.telefono && (
          <p className="text-xs text-slate-600 truncate">{lead.telefono}</p>
        )}
        {lead.fuente && (
          <p className="text-xs text-slate-400 truncate capitalize">{lead.fuente}</p>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Mostrar propuestas de la tabla si existen, sino mostrar campos legacy */}
          {propuestasSummary.count > 0 ? (
            <span
              className={cn(
                'flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium',
                'bg-blue-100 text-blue-700'
              )}
              title={`${propuestasSummary.count} propuesta${propuestasSummary.count > 1 ? 's' : ''}`}
            >
              <DollarSign size={10} />
              {propuestasSummary.totalUSD > 0
                ? `USD ${propuestasSummary.totalUSD.toLocaleString('en-US')}`
                : propuestasSummary.totalARS > 0
                  ? `ARS ${propuestasSummary.totalARS.toLocaleString('es-AR')}`
                  : propuestasSummary.count}
            </span>
          ) : valorLabel ? (
            <span className={cn('text-xs font-medium', isHighValue ? 'text-emerald-600' : 'text-slate-600')}>
              {isHighValue && <DollarSign size={10} className="inline -mt-0.5" />}
              {valorLabel}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {pendingTasksCount > 0 && (
            <span
              className={cn(
                'flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium',
                'bg-amber-100 text-amber-700'
              )}
              title={`${pendingTasksCount} tarea${pendingTasksCount > 1 ? 's' : ''} pendiente${pendingTasksCount > 1 ? 's' : ''}`}
            >
              <CheckSquare size={10} />
              {pendingTasksCount}
            </span>
          )}
          {sinRespuesta && (
            <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
          )}
          <ResponsablePicker
            lead={lead}
            users={users}
            onAssign={(userId) => updateResponsableMutation.mutate(userId)}
          />
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {timeAgo(lead.last_activity_at)}
          </span>
        </div>
      </div>
    </div>
  )
}

// Responsable picker component
interface ResponsablePickerProps {
  lead: Lead
  users: User[]
  onAssign: (userId: string | null) => void
}

function ResponsablePicker({ lead, users, onAssign }: ResponsablePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  return (
    <div ref={pickerRef} className="relative z-50">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="hover:ring-2 hover:ring-blue-400 rounded-full transition-all"
        title={lead.responsable ? lead.responsable.full_name : 'Asignar responsable'}
      >
        {lead.responsable ? (
          <UserAvatar
            name={lead.responsable.full_name}
            avatarUrl={lead.responsable.avatar_url}
            size="sm"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs text-slate-500 hover:bg-slate-300">
            +
          </div>
        )}
      </button>

      {isOpen && (
        <div
          className="fixed right-0 bottom-auto mb-2 w-48 bg-white rounded-lg shadow-lg border z-[100] py-1"
          style={{
            transform: 'translateX(-100%) translateY(-100%)',
            marginTop: '-8px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-2 py-1 border-b">
            <span className="text-xs font-medium text-slate-600">Asignar a</span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => {
                  onAssign(user.id)
                  setIsOpen(false)
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 text-left',
                  lead.responsable_id === user.id && 'bg-blue-50'
                )}
              >
                <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} size="xs" />
                <span
                  className={cn(
                    'truncate',
                    lead.responsable_id === user.id ? 'text-blue-700 font-medium' : 'text-slate-700'
                  )}
                >
                  {user.full_name}
                </span>
              </button>
            ))}
            {lead.responsable && (
              <button
                onClick={() => {
                  onAssign(null)
                  setIsOpen(false)
                }}
                className="w-full px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50 text-left border-t"
              >
                Quitar asignación
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Ghost card shown while dragging over an empty column
export function LeadCardGhost() {
  return (
    <div className="bg-slate-100 rounded-lg border border-dashed border-slate-300 p-4 h-32 opacity-50" />
  )
}
