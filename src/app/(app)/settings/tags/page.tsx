'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { LeadTag } from '@/types'

const TAG_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#64748b',
]

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {TAG_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full border-2 transition-transform ${value === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
          style={{ background: c }}
        />
      ))}
    </div>
  )
}

export default function TagsSettingsPage() {
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState(TAG_COLORS[0])

  const { data } = useQuery<{ data: LeadTag[] }>({
    queryKey: ['tags'],
    queryFn: () => fetch('/api/tags').then((r) => r.json()),
  })

  const tags = data?.data ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tags'] })

  const createMutation = useMutation({
    mutationFn: async (body: object) => {
      const res = await fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Error al crear etiqueta')
      return json
    },
    onSuccess: () => { invalidate(); setShowNew(false); setNewName(''); toast.success('Etiqueta creada') },
    onError: (err: Error) => toast.error(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name: string; color: string }) => {
      const res = await fetch(`/api/tags/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Error al actualizar')
      return json
    },
    onSuccess: () => { invalidate(); setEditingId(null); toast.success('Etiqueta actualizada') },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Error al eliminar')
      return json
    },
    onSuccess: () => { invalidate(); toast.success('Etiqueta eliminada') },
    onError: (err: Error) => toast.error(err.message),
  })

  const startEdit = (tag: LeadTag) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Etiquetas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Organiza tus leads con etiquetas de colores</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={15} /> Nueva etiqueta
        </button>
      </div>

      {/* New tag form */}
      {showNew && (
        <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <h3 className="text-sm font-medium text-slate-700">Nueva etiqueta</h3>
          <input
            autoFocus
            type="text"
            placeholder="Nombre de la etiqueta"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full text-sm border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            onKeyDown={(e) => e.key === 'Enter' && newName.trim() && createMutation.mutate({ name: newName, color: newColor })}
          />
          <ColorPicker value={newColor} onChange={setNewColor} />
          <div className="flex gap-2">
            <button
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ name: newName, color: newColor })}
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

      {/* Tags list */}
      <div className="bg-white border rounded-xl divide-y">
        {tags.length === 0 ? (
          <p className="text-sm text-slate-400 italic p-4">No hay etiquetas aún</p>
        ) : (
          tags.map((tag) => (
            <div key={tag.id} className="p-3">
              {editingId === tag.id ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full text-sm border rounded px-2 py-1"
                  />
                  <ColorPicker value={editColor} onChange={setEditColor} />
                  <div className="flex gap-2">
                    <button
                      disabled={!editName.trim() || updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: tag.id, name: editName, color: editColor })}
                      className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Guardar
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-slate-100">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tag.color }} />
                  <span className="text-sm font-medium text-slate-800 flex-1">{tag.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(tag)} className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => { if (confirm(`¿Eliminar "${tag.name}"?`)) deleteMutation.mutate(tag.id) }}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-slate-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
