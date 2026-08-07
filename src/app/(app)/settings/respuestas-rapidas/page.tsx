'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Zap, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'

interface QuickReply { id: string; titulo: string; cuerpo: string; created_at: string }

async function fetchReplies(): Promise<{ data: QuickReply[] }> {
  const r = await fetch('/api/admin/quick-replies')
  if (!r.ok) throw new Error('Error')
  return r.json()
}

export default function RespuestasRapidasPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [titulo, setTitulo]     = useState('')
  const [cuerpo, setCuerpo]     = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['quick-replies'], queryFn: fetchReplies })

  const create = useMutation({
    mutationFn: () => fetch('/api/admin/quick-replies', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo, cuerpo }),
    }).then(r => r.json()),
    onSuccess: (j) => {
      if (j.error) { toast.error(j.error); return }
      toast.success('Respuesta creada')
      qc.invalidateQueries({ queryKey: ['quick-replies'] })
      setTitulo(''); setCuerpo(''); setShowForm(false)
    },
    onError: () => toast.error('Error al crear'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/quick-replies/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { toast.success('Eliminada'); qc.invalidateQueries({ queryKey: ['quick-replies'] }) },
    onError: () => toast.error('Error al eliminar'),
  })

  const replies = data?.data ?? []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b bg-white flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Respuestas rápidas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Texto predefinido para insertar en comentarios de tickets</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} /> Nueva respuesta
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : replies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
            <Zap size={28} />
            <p className="text-sm">No hay respuestas rápidas todavía</p>
            <button onClick={() => setShowForm(true)} className="text-sm text-blue-500 hover:underline">Crear la primera</button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {replies.map((r, i) => (
              <div key={r.id} className={`flex items-start gap-3 px-4 py-4 ${i < replies.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <Zap size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{r.titulo}</p>
                  <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">{r.cuerpo}</p>
                </div>
                <button
                  onClick={() => { if (confirm(`¿Eliminar "${r.titulo}"?`)) remove.mutate(r.id) }}
                  className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">Nueva respuesta rápida</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); create.mutate() }} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Nombre corto</label>
                <input
                  required
                  value={titulo}
                  onChange={e => setTitulo(e.target.value)}
                  placeholder="Ej: Saludo inicial"
                  maxLength={100}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Texto completo</label>
                <textarea
                  required
                  value={cuerpo}
                  onChange={e => setCuerpo(e.target.value)}
                  placeholder="Ej: Hola, gracias por contactarnos. Estamos revisando tu consulta y te responderemos a la brevedad."
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:text-slate-900 transition-colors">Cancelar</button>
                <button type="submit" disabled={create.isPending || !titulo.trim() || !cuerpo.trim()} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50 transition-colors">
                  {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
