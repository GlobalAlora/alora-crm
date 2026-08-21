'use client'

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { Lead, PipelineStage } from '@/types'
import { PIPELINE_STAGES } from '@/types'
import { leadsApi } from '@/lib/api'
import { KanbanColumn } from './KanbanColumn'
import { LeadCard } from './LeadCard'
import { useActivePipelineStages } from '@/hooks/usePipelineStages'

interface KanbanBoardProps {
  onLeadClick: (lead: Lead) => void
}

type LeadsByStage = Record<PipelineStage, Lead[]>

// Which date best represents "cuándo entró a esta etapa" varies per etapa —
// mirrors the fields auto-stamped in /api/leads/[id]/stage/route.ts. Stages
// without a specific milestone date (and any custom stage from the
// pipeline_stages table) fall back to stage_updated_at.
const STAGE_SORT_FIELD: Partial<Record<PipelineStage, keyof Lead>> = {
  lead_entrante: 'fecha_ingreso',
  lead_contactado: 'fecha_contacto',
  reunion_reservada: 'fecha_reunion',
  reunion_realizada: 'fecha_reunion',
  propuesta_enviada: 'fecha_propuesta',
  follow_up: 'fecha_followup',
  cliente_ganado: 'fecha_cierre',
  cliente_perdido: 'fecha_cierre',
}

function groupByStage(leads: Lead[]): LeadsByStage {
  const initial = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s.value, []])
  ) as unknown as LeadsByStage

  const grouped = leads.reduce((acc, lead) => {
    if (!acc[lead.estado_pipeline]) {
      acc[lead.estado_pipeline] = []
    }
    acc[lead.estado_pipeline].push(lead)
    return acc
  }, initial)

  for (const stage of Object.keys(grouped) as PipelineStage[]) {
    const field = STAGE_SORT_FIELD[stage] ?? 'stage_updated_at'
    grouped[stage].sort((a, b) => {
      const dateA = (a[field] as string | null) ?? a.stage_updated_at
      const dateB = (b[field] as string | null) ?? b.stage_updated_at
      return new Date(dateB).getTime() - new Date(dateA).getTime()
    })
  }

  return grouped
}

export function KanbanBoard({ onLeadClick }: KanbanBoardProps) {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overColumnId, setOverColumnId] = useState<PipelineStage | null>(null)
  const activeStages = useActivePipelineStages()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)


  // Horizontal scroll with mouse wheel
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      // Check if scrolling inside a column (kanban-cards)
      const target = e.target as HTMLElement
      const isInsideColumn = target.closest('.kanban-cards')
      
      // Allow natural vertical scroll inside columns
      if (isInsideColumn) return
      
      // Convert vertical to horizontal for the main board
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return // natural trackpad horizontal
      if (e.deltaY === 0) return
      e.preventDefault()
      el.scrollLeft += e.deltaY * 1.5
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // Click and drag scroll
  const handleMouseDown = (e: React.MouseEvent) => {
    const el = scrollRef.current
    if (!el) return
    setIsDragging(true)
    setStartX(e.pageX - el.offsetLeft)
    setScrollLeft(el.scrollLeft)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    const el = scrollRef.current
    if (!el) return
    e.preventDefault()
    const x = e.pageX - el.offsetLeft
    const walk = (x - startX) * 2
    el.scrollLeft = scrollLeft - walk
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['leads', { view: 'kanban' }],
    queryFn: () => leadsApi.list({ view: 'kanban', limit: 500, sort_by: 'created_at', sort_order: 'asc' }),
    staleTime: 30_000,
  })

  const leads = data?.data ?? []
  const [optimisticLeads, setOptimisticLeads] = useState<Lead[] | null>(null)
  const displayLeads = optimisticLeads ?? leads
  const grouped = groupByStage(displayLeads)

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: PipelineStage }) =>
      leadsApi.moveStage(id, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (error: Error) => {
      setOptimisticLeads(null)
      toast.error(error.message || 'Error al mover el lead')
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const activeLead = activeId ? displayLeads.find((l) => l.id === activeId) : null

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(active.id as string)
  }, [])

  const handleDragOver = useCallback(({ over }: DragOverEvent) => {
    if (!over) { setOverColumnId(null); return }
    const overId = over.id as string
    const isColumn = activeStages.some((s) => s.value === overId)
    if (isColumn) {
      setOverColumnId(overId as PipelineStage)
    } else {
      const overLead = displayLeads.find((l) => l.id === overId)
      setOverColumnId(overLead?.estado_pipeline ?? null)
    }
  }, [displayLeads])

  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    setActiveId(null)
    setOverColumnId(null)

    if (!over) return

    const draggedLead = displayLeads.find((l) => l.id === active.id)
    if (!draggedLead) return

    const overId = over.id as string
    const isColumn = activeStages.some((s) => s.value === overId)
    const targetStage = isColumn
      ? (overId as PipelineStage)
      : displayLeads.find((l) => l.id === overId)?.estado_pipeline

    if (!targetStage) return

    const stageChanged = draggedLead.estado_pipeline !== targetStage

    if (stageChanged) {
      // Optimistic: move card to new column at the end
      const updated = displayLeads.map((l) =>
        l.id === draggedLead.id ? { ...l, estado_pipeline: targetStage } : l
      )
      setOptimisticLeads(updated)
      stageMutation.mutate({ id: draggedLead.id, stage: targetStage }, {
        onSettled: () => setOptimisticLeads(null),
      })
    }
    // Dropping within the same column is a no-op — order is always automatic
    // by the stage's relevant date (see STAGE_SORT_FIELD / groupByStage).
  }, [displayLeads, stageMutation])

  // Restore horizontal scroll position when returning via browser back
  useEffect(() => {
    if (isLoading) return
    const saved = sessionStorage.getItem('kanban-scroll-left')
    if (!saved) return
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => { el.scrollLeft = Number(saved) })
  }, [isLoading])

  const handleLeadClickWithScrollSave = useCallback((lead: Lead) => {
    if (scrollRef.current) {
      sessionStorage.setItem('kanban-scroll-left', String(scrollRef.current.scrollLeft))
    }
    // Save ordered IDs for this stage so lead detail can show prev/next arrows
    const stageLeads = grouped[lead.estado_pipeline] ?? []
    sessionStorage.setItem('kanban-nav', JSON.stringify({ ids: stageLeads.map(l => l.id) }))
    onLeadClick(lead)
  }, [onLeadClick, grouped])

  if (isLoading) {
    return (
      <div className="kanban-board">
        {activeStages.map((s) => (
          <div key={s.value} className="kanban-column rounded-xl border bg-slate-50 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div
        ref={scrollRef}
        className="kanban-board md:space-x-6 space-x-4"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {activeStages.map((stage) => (
          <KanbanColumn
            key={stage.value}
            stage={stage.value}
            leads={grouped[stage.value] ?? []}
            onLeadClick={handleLeadClickWithScrollSave}
            isOver={overColumnId === stage.value}
          />
        ))}
      </div>

      <DragOverlay>
        {activeLead && (
          <div className="rotate-2 shadow-2xl">
            <LeadCard lead={activeLead} onClick={() => {}} />
          </div>
        )}
      </DragOverlay>

    </DndContext>
  )
}
