'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2, Plus, Check, X, Lock, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PipelineStageDB } from '@/hooks/usePipelineStages'
import toast from 'react-hot-toast'

// ── Color presets ────────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  { color: '#64748b', bg: '#f1f5f9' },
  { color: '#3b82f6', bg: '#eff6ff' },
  { color: '#8b5cf6', bg: '#f5f3ff' },
  { color: '#6366f1', bg: '#eef2ff' },
  { color: '#0ea5e9', bg: '#f0f9ff' },
  { color: '#06b6d4', bg: '#ecfeff' },
  { color: '#f97316', bg: '#fff7ed' },
  { color: '#f59e0b', bg: '#fffbeb' },
  { color: '#22c55e', bg: '#f0fdf4' },
  { color: '#ef4444', bg: '#fef2f2' },
  { color: '#ec4899', bg: '#fdf2f8' },
  { color: '#94a3b8', bg: '#f8fafc' },
]

const ZONE_OPTIONS = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'gestion', label: 'Gestión' },
  { value: 'cierre', label: 'Cierre' },
]

// ── Fetch / mutations ────────────────────────────────────────────────────────
async function fetchStages(): Promise<PipelineStageDB[]> {
  const res = await fetch('/api/pipeline-stages')
  const json = await res.json()
  return json.data ?? []
}

// ── SortableRow ──────────────────────────────────────────────────────────────
function SortableRow({
  stage,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  stage: PipelineStageDB
  onEdit: (s: PipelineStageDB) => void
  onDelete: (s: PipelineStageDB) => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 bg-white rounded-xl border px-4 py-3 group transition-shadow',
        isDragging ? 'shadow-lg border-violet-300' : 'border-slate-200 hover:border-slate-300'
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
        aria-label="Arrastrar"
      >
        <GripVertical size={16} />
      </button>

      {/* Color dot */}
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: stage.color }}
      />

      {/* Label */}
      <span className="flex-1 text-sm font-medium text-slate-700">{stage.label}</span>

      {/* Zone badge */}
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide hidden sm:block">
        {ZONE_OPTIONS.find(z => z.value === stage.zone)?.label ?? stage.zone}
      </span>

      {/* System lock */}
      {stage.is_system && (
        <span title="Etapa del sistema" className="text-slate-300">
          <Lock size={12} />
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-20 disabled:cursor-not-allowed"
          title="Mover arriba"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-20 disabled:cursor-not-allowed"
          title="Mover abajo"
        >
          <ChevronDown size={14} />
        </button>
        <button
          onClick={() => onEdit(stage)}
          className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          title="Editar"
        >
          <Pencil size={14} />
        </button>
        {!stage.is_system && (
          <button
            onClick={() => onDelete(stage)}
            className="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── StageForm ────────────────────────────────────────────────────────────────
function StageForm({
  initial,
  onSave,
  onCancel,
  loading,
}: {
  initial?: Partial<PipelineStageDB>
  onSave: (data: { label: string; color: string; bg_color: string; zone: string }) => void
  onCancel: () => void
  loading: boolean
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [color, setBgColor] = useState(initial?.color ?? COLOR_PRESETS[0].color)
  const [bg_color, setBg] = useState(initial?.bg_color ?? COLOR_PRESETS[0].bg)
  const [zone, setZone] = useState(initial?.zone ?? 'gestion')

  const selectPreset = (preset: { color: string; bg: string }) => {
    setBgColor(preset.color)
    setBg(preset.bg)
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
      {/* Label */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">Nombre de la etapa</label>
        <input
          autoFocus
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Ej: En negociación"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>

      {/* Color presets */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">Color</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map(p => (
            <button
              key={p.color}
              type="button"
              onClick={() => selectPreset(p)}
              className={cn(
                'w-6 h-6 rounded-full border-2 transition-transform',
                color === p.color ? 'border-slate-700 scale-110' : 'border-transparent hover:scale-105'
              )}
              style={{ backgroundColor: p.color }}
              title={p.color}
            />
          ))}
        </div>
        {/* Preview badge */}
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
          style={{ color, backgroundColor: bg_color, borderColor: color + '40' }}
        >
          {label || 'Vista previa'}
        </span>
      </div>

      {/* Zone */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">Zona del pipeline</label>
        <div className="flex gap-2">
          {ZONE_OPTIONS.map(z => (
            <button
              key={z.value}
              type="button"
              onClick={() => setZone(z.value)}
              className={cn(
                'flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all',
                zone === z.value
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'border-slate-200 text-slate-500 hover:border-violet-300'
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onSave({ label, color, bg_color, zone })}
          disabled={!label.trim() || loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
        >
          <Check size={14} />
          {loading ? 'Guardando...' : 'Guardar'}
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50"
        >
          <X size={14} />
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function PipelineSettingsPage() {
  const qc = useQueryClient()
  const [editingStage, setEditingStage] = useState<PipelineStageDB | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [deletingStage, setDeletingStage] = useState<PipelineStageDB | null>(null)

  const { data: stages = [], isLoading } = useQuery<PipelineStageDB[]>({
    queryKey: ['pipeline-stages'],
    queryFn: fetchStages,
  })

  const [localOrder, setLocalOrder] = useState<PipelineStageDB[]>([])
  const orderedStages = localOrder.length > 0 ? localOrder : stages

  // Sync local order when stages load
  if (stages.length > 0 && localOrder.length === 0) {
    setLocalOrder(stages)
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Reorder mutation ─────────────────────────────────────────────────────
  const reorderMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/pipeline-stages/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline-stages'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = orderedStages.findIndex(s => s.id === active.id)
    const newIndex = orderedStages.findIndex(s => s.id === over.id)
    const newOrder = arrayMove(orderedStages, oldIndex, newIndex)
    setLocalOrder(newOrder)
    reorderMutation.mutate(newOrder.map(s => s.id))
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const newOrder = arrayMove(orderedStages, index, index - 1)
    setLocalOrder(newOrder)
    reorderMutation.mutate(newOrder.map(s => s.id))
  }

  const handleMoveDown = (index: number) => {
    if (index === orderedStages.length - 1) return
    const newOrder = arrayMove(orderedStages, index, index + 1)
    setLocalOrder(newOrder)
    reorderMutation.mutate(newOrder.map(s => s.id))
  }

  // ── Add mutation ─────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async (data: { label: string; color: string; bg_color: string; zone: string }) => {
      const res = await fetch('/api/pipeline-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      toast.success('Etapa creada')
      setShowAddForm(false)
      setLocalOrder([])
      qc.invalidateQueries({ queryKey: ['pipeline-stages'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Edit mutation ─────────────────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { label: string; color: string; bg_color: string; zone: string } }) => {
      const res = await fetch(`/api/pipeline-stages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      toast.success('Etapa actualizada')
      setEditingStage(null)
      setLocalOrder([])
      qc.invalidateQueries({ queryKey: ['pipeline-stages'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // ── Delete mutation ───────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/pipeline-stages/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
    },
    onSuccess: () => {
      toast.success('Etapa eliminada')
      setDeletingStage(null)
      setLocalOrder([])
      qc.invalidateQueries({ queryKey: ['pipeline-stages'] })
    },
    onError: (e: Error) => {
      toast.error(e.message)
      setDeletingStage(null)
    },
  })

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Etapas del pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Arrastrá para reordenar. Las etapas del sistema no se pueden eliminar.
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setEditingStage(null) }}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700"
        >
          <Plus size={14} />
          Nueva etapa
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <StageForm
          onSave={data => addMutation.mutate(data)}
          onCancel={() => setShowAddForm(false)}
          loading={addMutation.isPending}
        />
      )}

      {/* Stages list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedStages.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {orderedStages.map((stage, index) => (
                <div key={stage.id}>
                  {editingStage?.id === stage.id ? (
                    <StageForm
                      initial={stage}
                      onSave={data => editMutation.mutate({ id: stage.id, data })}
                      onCancel={() => setEditingStage(null)}
                      loading={editMutation.isPending}
                    />
                  ) : (
                    <SortableRow
                      stage={stage}
                      onEdit={setEditingStage}
                      onDelete={setDeletingStage}
                      onMoveUp={() => handleMoveUp(index)}
                      onMoveDown={() => handleMoveDown(index)}
                      isFirst={index === 0}
                      isLast={index === orderedStages.length - 1}
                    />
                  )}
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Delete confirmation modal */}
      {deletingStage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <Trash2 size={20} className="text-red-500" />
              </div>
              <h3 className="font-semibold text-slate-800">Eliminar etapa</h3>
              <p className="text-sm text-slate-500">
                ¿Eliminar <strong>{deletingStage.label}</strong>? Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingStage(null)}
                className="flex-1 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(deletingStage.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
