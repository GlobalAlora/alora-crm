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
