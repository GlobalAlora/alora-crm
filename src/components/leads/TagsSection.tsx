'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LeadTag } from '@/types'

interface TagsSectionProps {
  leadId: string
  readOnly?: boolean
}

export function TagsSection({ leadId, readOnly = false }: TagsSectionProps) {
  const queryClient = useQueryClient()
  const [showPicker, setShowPicker] = useState(false)

  // All available tags
  const { data: allTagsData } = useQuery<{ data: LeadTag[] }>({
    queryKey: ['tags'],
    queryFn: () => fetch('/api/tags').then((r) => r.json()),
  })

  // Tags assigned to this lead
  const { data: leadTagsData } = useQuery<{ data: LeadTag[] }>({
    queryKey: ['lead-tags', leadId],
    queryFn: () => fetch(`/api/leads/${leadId}/tags`).then((r) => r.json()),
  })

  const allTags = allTagsData?.data ?? []
  const leadTags = leadTagsData?.data ?? []
  const leadTagIds = new Set(leadTags.map((t) => t.id))
  const availableTags = allTags.filter((t) => !leadTagIds.has(t.id))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['lead-tags', leadId] })

  const addMutation = useMutation({
    mutationFn: (tag_id: string) =>
      fetch(`/api/leads/${leadId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id }),
      }).then((r) => r.json()),
    onSuccess: () => { invalidate(); toast.success('Etiqueta agregada') },
    onError: () => toast.error('Error al agregar etiqueta'),
  })

  const removeMutation = useMutation({
    mutationFn: (tag_id: string) =>
      fetch(`/api/leads/${leadId}/tags`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id }),
      }).then((r) => r.json()),
    onSuccess: () => { invalidate(); toast.success('Etiqueta removida') },
    onError: () => toast.error('Error al remover etiqueta'),
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">Etiquetas</span>
        {!readOnly && allTags.length > 0 && (
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus size={12} /> Agregar
          </button>
        )}
      </div>

      {/* Current tags */}
      <div className="flex flex-wrap gap-1.5">
        {leadTags.length === 0 && !showPicker && (
          <span className="text-xs text-slate-300 italic">Sin etiquetas</span>
        )}
        {leadTags.map((tag) => (
          <span
            key={tag.id}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium text-white"
            style={{ background: tag.color }}
          >
            {tag.name}
            {!readOnly && (
              <button
                onClick={() => removeMutation.mutate(tag.id)}
                className="ml-0.5 hover:opacity-70"
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
      </div>

      {/* Tag picker */}
      {showPicker && availableTags.length > 0 && (
        <div className="bg-white border rounded-lg p-2 shadow-sm space-y-1">
          {availableTags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => { addMutation.mutate(tag.id); setShowPicker(false) }}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left hover:bg-slate-50 rounded"
            >
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tag.color }} />
              {tag.name}
            </button>
          ))}
        </div>
      )}
      {showPicker && availableTags.length === 0 && (
        <p className="text-xs text-slate-400 italic">Todas las etiquetas ya están asignadas</p>
      )}
    </div>
  )
}
