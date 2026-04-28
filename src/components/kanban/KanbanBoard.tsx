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
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { Lead, PipelineStage } from '@/types'
import { PIPELINE_STAGES } from '@/types'
import { leadsApi } from '@/lib/api'
import { midpoint } from '@/lib/utils'
import { KanbanColumn } from './KanbanColumn'
import { LeadCard } from './LeadCard'

interface KanbanBoardProps {
  onLeadClick: (lead: Lead) => void
}

type LeadsByStage = Record<PipelineStage, Lead[]>

function groupByStage(leads: Lead[]): LeadsByStage {
  const initial = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s.value, []])
  ) as unknown as LeadsByStage

  return leads.reduce((acc, lead) => {
    acc[lead.estado_pipeline].push(lead)
    return acc
  }, initial)
}

export function KanbanBoard({ onLeadClick }: KanbanBoardProps) {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overColumnId, setOverColumnId] = useState<PipelineStage | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['leads', { view: 'kanban' }],
    queryFn: () => leadsApi.list({ view: 'kanban', limit: 100 }),
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
    const isColumn = PIPELINE_STAGES.some((s) => s.value === overId)
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
    const isColumn = PIPELINE_STAGES.some((s) => s.value === overId)
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
        {PIPELINE_STAGES.map((s) => (
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
      <div className="kanban-board">
        {PIPELINE_STAGES.map((stage) => (
          <KanbanColumn
            key={stage.value}
            stage={stage.value}
            leads={grouped[stage.value]}
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
