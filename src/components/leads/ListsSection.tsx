'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, List } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LeadList } from '@/types'

interface ListsSectionProps {
  leadId: string
  readOnly?: boolean
}

export function ListsSection({ leadId, readOnly = false }: ListsSectionProps) {
  const queryClient = useQueryClient()
  const [showPicker, setShowPicker] = useState(false)

  // All lists
  const { data: allListsData } = useQuery<{ data: LeadList[] }>({
    queryKey: ['lists'],
    queryFn: () => fetch('/api/lists').then((r) => r.json()),
  })

  // Lists this lead belongs to (derive from all lists by checking if lead is in each)
  const { data: leadListsData } = useQuery<{ data: { list_id: string; list: LeadList }[] }>({
    queryKey: ['lead-lists', leadId],
    queryFn: async () => {
      const res = await fetch('/api/lists')
      const { data: lists }: { data: LeadList[] } = await res.json()
      // For each list, check if lead is in it via the list-leads endpoint
      // Simpler: query a dedicated endpoint
      const memberRes = await fetch(`/api/leads/${leadId}/lists`)
      if (memberRes.ok) {
        const json = await memberRes.json()
        return json
      }
      return { data: [] }
    },
  })

  const allLists = allListsData?.data ?? []
  const leadListMemberships = leadListsData?.data ?? []
  const leadLists: LeadList[] = leadListMemberships.map((m) => m.list)
  const leadListIds = new Set(leadLists.map((l) => l.id))
  const availableLists = allLists.filter((l) => !leadListIds.has(l.id))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['lead-lists', leadId] })
    queryClient.invalidateQueries({ queryKey: ['lists'] })
  }

  const addMutation = useMutation({
    mutationFn: (list_id: string) =>
      fetch(`/api/lists/${list_id}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      }).then((r) => r.json()),
    onSuccess: () => { invalidate(); toast.success('Agregado a la lista') },
    onError: () => toast.error('Error al agregar a la lista'),
  })

  const removeMutation = useMutation({
    mutationFn: (list_id: string) =>
      fetch(`/api/lists/${list_id}/leads`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      }).then((r) => r.json()),
    onSuccess: () => { invalidate(); toast.success('Removido de la lista') },
    onError: () => toast.error('Error al remover de la lista'),
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">Listas</span>
        {!readOnly && allLists.length > 0 && (
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus size={12} /> Agregar
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {leadLists.length === 0 && !showPicker && (
          <span className="text-xs text-slate-300 italic">Sin listas</span>
        )}
        {leadLists.map((list) => (
          <span key={list.id} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
            <List size={10} className="text-slate-400" />
            {list.name}
            {!readOnly && (
              <button onClick={() => removeMutation.mutate(list.id)} className="ml-0.5 hover:text-red-500">
                <X size={10} />
              </button>
            )}
          </span>
        ))}
      </div>

      {showPicker && availableLists.length > 0 && (
        <div className="bg-white border rounded-lg p-2 shadow-sm space-y-1">
          {availableLists.map((list) => (
            <button
              key={list.id}
              onClick={() => { addMutation.mutate(list.id); setShowPicker(false) }}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left hover:bg-slate-50 rounded"
            >
              <List size={11} className="text-slate-400" />
              {list.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
