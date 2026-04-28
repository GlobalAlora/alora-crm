'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AlertTriangle, DollarSign, CheckSquare, GripVertical } from 'lucide-react'
import type { Lead } from '@/types'
import { cn, formatUSD, timeAgo, hoursSince } from '@/lib/utils'
import { UserAvatar } from '@/components/shared/UserAvatar'

interface LeadCardProps {
  lead: Lead
  onClick: (lead: Lead) => void
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { lead } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const sinRespuesta = lead.stage_updated_at
    ? hoursSince(lead.stage_updated_at) > 48 &&
      (lead.estado_pipeline === 'lead_contactado' || lead.estado_pipeline === 'sin_respuesta')
    : false

  const isHighValue = (lead.valor_propuesta_usd ?? 0) >= 5000

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-white rounded-lg border shadow-sm p-3 cursor-pointer select-none group',
        'hover:shadow-md transition-shadow',
        sinRespuesta && 'border-l-4 border-l-red-400',
        isDragging && 'shadow-xl rotate-1'
      )}
      onClick={() => onClick(lead)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {lead.empresa && (
            <p className="text-xs text-slate-500 truncate mb-0.5">{lead.empresa}</p>
          )}
          <p className="text-sm font-semibold text-slate-900 truncate">{lead.nombre}</p>
          {lead.servicio_interesado && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{lead.servicio_interesado}</p>
          )}
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

      <div className="flex items-center justify-between mt-3 gap-2">
        <div className="flex items-center gap-1.5">
          {lead.valor_propuesta_usd != null && (
            <span
              className={cn(
                'text-xs font-medium',
                isHighValue ? 'text-emerald-600' : 'text-slate-600'
              )}
            >
              {isHighValue && <DollarSign size={10} className="inline -mt-0.5" />}
              {formatUSD(lead.valor_propuesta_usd)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {sinRespuesta && (
            <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
          )}
          {lead.responsable && (
            <UserAvatar
              name={lead.responsable.full_name}
              avatarUrl={lead.responsable.avatar_url}
              size="sm"
            />
          )}
          <span className="text-xs text-slate-400">
            {timeAgo(lead.last_activity_at)}
          </span>
        </div>
      </div>
    </div>
  )
}

// Ghost card shown while dragging over an empty column
export function LeadCardGhost() {
  return (
    <div className="bg-slate-100 rounded-lg border border-dashed border-slate-300 p-3 h-20 opacity-50" />
  )
}
