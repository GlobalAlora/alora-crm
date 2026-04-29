'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Users, ChevronRight, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import type { LeadList } from '@/types'

export default function ListsSettingsPage() {
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const { data } = useQuery<{ data: LeadList[] }>({
    queryKey: ['lists'],
    queryFn: () => fetch('/api/lists').then((r) => r.json()),
  })

  const lists = data?.data ?? []
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['lists'] })

  const createMutation = useMutation({
    mutationFn: (body: object) =>
      fetch('/api/lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()),
    onSuccess: () => { invalidate(); setShowNew(false); setNewName(''); setNewDesc(''); toast.success('Lista creada') },
    onError: () => toast.error('Error al crear lista'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/lists/${id}`, { method: 'DELETE' }).then((r) => r.json()),
    onSuccess: () => { invalidate(); toast.success('Lista eliminada') },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Listas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Agrupa leads manualmente para campañas o seguimiento</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={15} /> Nueva lista
        </button>
      </div>

      {showNew && (
        <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <h3 className="text-sm font-medium text-slate-700">Nueva lista</h3>
          <input
            autoFocus
            type="text"
            placeholder="Nombre de la lista"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full text-sm border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <input
            type="text"
            placeholder="Descripción (opcional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full text-sm border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            <button
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ name: newName, description: newDesc })}
              className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <Check size={12} /> Guardar
            </button>
            <button onClick={() => { setShowNew(false); setNewName('') }} className="text-xs text-slate-500 px-3 py-1.5 rounded hover:bg-slate-100">
              <X size={12} className="inline mr-1" />Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-xl divide-y">
        {lists.length === 0 ? (
          <p className="text-sm text-slate-400 italic p-4">No hay listas aún</p>
        ) : (
          lists.map((list) => (
            <div key={list.id} className="flex items-center gap-3 p-3 hover:bg-slate-50">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users size={14} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{list.name}</p>
                {list.description && <p className="text-xs text-slate-500 truncate">{list.description}</p>}
                <p className="text-xs text-slate-400">{list.lead_count ?? 0} leads</p>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  href={`/settings/lists/${list.id}`}
                  className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100"
                >
                  <ChevronRight size={14} />
                </Link>
                <button
                  onClick={() => { if (confirm(`¿Eliminar "${list.name}"?`)) deleteMutation.mutate(list.id) }}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-slate-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
