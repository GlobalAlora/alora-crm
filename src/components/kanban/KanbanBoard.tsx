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
import { arrayMove } from '@dnd-kit/sortable'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { Lead, PipelineStage } from '@/types'
import { PIPELINE_STAGES } from '@/types'
import { leadsApi } from '@/lib/api'
import { midpoint } from '@/lib/utils'
import { KanbanColumn } from './KanbanColumn'
import { LeadCard } from './LeadCard'
import { usePipelineStages } from '@/hooks/usePipelineStages'

interface KanbanBoardProps {
  onLeadClick: (lead: Lead) => void
}

type LeadsByStage = Record<PipelineStage, Lead[]>

function groupByStage(leads: Lead[]): LeadsByStage {
  const initial = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s.value, []])
  ) as unknown as LeadsByStage

  return leads.reduce((acc, lead) => {
    if (!acc[lead.estado_pipeline]) {
      acc[lead.estado_pipeline] = []
    }
    acc[lead.estado_pipeline].push(lead)
    return acc
  }, initial)
}

export function KanbanBoard({ onLeadClick }: KanbanBoardProps) {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overColumnId, setOverColumnId] = useState<PipelineStage | null>(null)
  const { data: dbStages } = usePipelineStages()
  // Use DB stages if available, fall back to hardcoded constant
  const activeStages = dbStages && dbStages.length > 0
    ? dbStages.map(s => ({ value: s.key as PipelineStage, label: s.label, color: s.color, bgColor: s.bg_color, zone: s.zone }))
    : PIPELINE_STAGES
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

  const positionMutation = useMutation({
    mutationFn: ({ id, position, updatedAt }: { id: string; position: number; updatedAt: string }) =>
      leadsApi.updatePosition(id, position, updatedAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (error: Error) => {
      setOptimisticLeads(null)
      if (error.message.includes('409') || error.message.includes('modificado')) {
        toast.error('El tablero fue modificado por otro usuario. Recargando...')
        queryClient.invalidateQueries({ queryKey: ['leads'] })
      } else {
        toast.error(error.message || 'Error al reordenar')
      }
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
      return
    }

    // Same column reorder
    if (!isColumn) {
      const overLead = displayLeads.find((l) => l.id === overId)
      if (!overLead || overLead.id === draggedLead.id) return

      const columnLeads = grouped[targetStage]
      const oldIdx = columnLeads.findIndex((l) => l.id === draggedLead.id)
      const newIdx = columnLeads.findIndex((l) => l.id === overLead.id)
      const reordered = arrayMove(columnLeads, oldIdx, newIdx)

      const prevPosition = reordered[newIdx - 1]?.kanban_position ?? null
      const nextPosition = reordered[newIdx + 1]?.kanban_position ?? null
      const newPosition = midpoint(prevPosition, nextPosition)

      const updated = displayLeads.map((l) =>
        l.id === draggedLead.id ? { ...l, kanban_position: newPosition } : l
      )
      setOptimisticLeads(updated)
      positionMutation.mutate(
        { id: draggedLead.id, position: newPosition, updatedAt: draggedLead.updated_at },
        { onSettled: () => setOptimisticLeads(null) }
      )
    }
  }, [displayLeads, grouped, stageMutation, positionMutation])

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
            onLeadClick={onLeadClick}
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
