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
import { Calendar, X } from 'lucide-react'

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  // Meeting date modal — shown when dropping a lead into reunion_reservada
  const [meetingModal, setMeetingModal] = useState<{ leadId: string; leadName: string } | null>(null)
  const [meetingDate, setMeetingDate] = useState('')
  const pendingMeetingRef = useRef<{ lead: Lead; targetStage: PipelineStage } | null>(null)

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
    queryFn: () => leadsApi.list({ view: 'kanban', limit: 100 }),
    staleTime: 30_000,
  })

  const leads = data?.data ?? []
  const [optimisticLeads, setOptimisticLeads] = useState<Lead[] | null>(null)
  const displayLeads = optimisticLeads ?? leads
  const grouped = groupByStage(displayLeads)

  const stageMutation = useMutation({
    mutationFn: ({ id, stage, fechaReunion }: { id: string; stage: PipelineStage; fechaReunion?: string | null }) =>
      leadsApi.moveStage(id, stage, fechaReunion),
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
      if (targetStage === 'reunion_reservada') {
        // Ask for the actual meeting date before committing the move
        pendingMeetingRef.current = { lead: draggedLead, targetStage }
        setMeetingDate('')
        setMeetingModal({ leadId: draggedLead.id, leadName: [draggedLead.nombre, draggedLead.apellido].filter(Boolean).join(' ') })
        return
      }

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

  const confirmMeeting = useCallback(() => {
    const pending = pendingMeetingRef.current
    if (!pending) return

    const { lead, targetStage } = pending
    const fechaReunion = meetingDate ? new Date(meetingDate).toISOString() : null

    const updated = displayLeads.map((l) =>
      l.id === lead.id ? { ...l, estado_pipeline: targetStage, fecha_reunion: fechaReunion ?? undefined } : l
    )
    setOptimisticLeads(updated)
    stageMutation.mutate({ id: lead.id, stage: targetStage, fechaReunion }, {
      onSettled: () => setOptimisticLeads(null),
    })
    pendingMeetingRef.current = null
    setMeetingModal(null)
  }, [displayLeads, meetingDate, stageMutation])

  const cancelMeeting = useCallback(() => {
    pendingMeetingRef.current = null
    setMeetingModal(null)
  }, [])

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
      <div
        ref={scrollRef}
        className="kanban-board md:space-x-6 space-x-4"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
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

      {/* Meeting date modal */}
      {meetingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Calendar size={16} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">¿Cuándo es la reunión?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{meetingModal.leadName}</p>
                </div>
              </div>
              <button onClick={cancelMeeting} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={16} />
              </button>
            </div>

            <input
              type="datetime-local"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />

            <div className="flex gap-2 mt-4">
              <button
                onClick={cancelMeeting}
                className="flex-1 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmMeeting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {meetingDate ? 'Confirmar' : 'Sin fecha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  )
}
