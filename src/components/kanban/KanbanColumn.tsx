'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Lead, PipelineStage } from '@/types'
import { PIPELINE_STAGE_MAP } from '@/types'
import { cn } from '@/lib/utils'
import { LeadCard } from './LeadCard'

interface KanbanColumnProps {
  stage: PipelineStage
  leads: Lead[]
  onLeadClick: (lead: Lead) => void
  isOver?: boolean
}

export function KanbanColumn({ stage, leads, onLeadClick, isOver }: KanbanColumnProps) {
  const config = PIPELINE_STAGE_MAP[stage]
  const { setNodeRef } = useDroppable({ id: stage })

  // Calculate totals (use propuestas totals if available, fallback to legacy fields)
  const totalUSD = leads.reduce((sum, lead) => sum + (lead.propuestas_total_usd || lead.valor_propuesta_usd || 0), 0)
  const totalARS = leads.reduce((sum, lead) => sum + (lead.propuestas_total_ars || lead.valor_propuesta_ars || 0), 0)

  const formatUSD = (val: number) => {
    if (val === 0) return '$0'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val)
  }

  const formatARS = (val: number) => {
    if (val === 0) return 'ARS 0'
    return `ARS ${val.toLocaleString('es-AR')}`
  }

  return (
    <div className={cn('kanban-column rounded-xl border bg-slate-50', isOver && 'ring-2 ring-blue-400')}>
      {/* Column header */}
      <div className="px-3 py-3 border-b bg-white rounded-t-xl flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: config.color }} />
          <span className="text-xs font-semibold text-slate-700 leading-tight">{config.label}</span>
        </div>
        <span
          className="text-xs font-semibold rounded-full px-1.5 py-0.5 min-w-[20px] text-center"
          style={{ color: config.color, backgroundColor: config.bgColor }}
        >
          {leads.length}
        </span>
      </div>

      {/* Totals */}
      {(totalUSD > 0 || totalARS > 0) && (
        <div className="px-3 py-2 border-b bg-slate-50 text-xs space-y-1">
          {totalUSD > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Total USD:</span>
              <span className="font-medium text-slate-700">{formatUSD(totalUSD)}</span>
            </div>
          )}
          {totalARS > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Total ARS:</span>
              <span className="font-medium text-slate-700">{formatARS(totalARS)}</span>
            </div>
          )}
        </div>
      )}

      {/* Cards */}
      <div ref={setNodeRef} className="kanban-cards space-y-2 p-2">
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={onLeadClick} />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-slate-400">
            Arrastrá un lead aquí
          </div>
        )}
      </div>
    </div>
  )
}
