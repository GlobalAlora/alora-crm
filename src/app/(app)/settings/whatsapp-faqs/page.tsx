'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Check, X, Bot } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type { WhatsAppFaq } from '@/types'

export default function WhatsAppFaqsSettingsPage() {
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newPregunta, setNewPregunta] = useState('')
  const [newRespuesta, setNewRespuesta] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPregunta, setEditPregunta] = useState('')
  const [editRespuesta, setEditRespuesta] = useState('')

  const { data, isLoading } = useQuery<{ data: WhatsAppFaq[] }>({
    queryKey: ['whatsapp-faqs'],
    queryFn: () => fetch('/api/whatsapp/faqs').then((r) => r.json()),
  })

  const faqs = data?.data ?? []
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['whatsapp-faqs'] })

  const createMutation = useMutation({
    mutationFn: (body: { pregunta: string; respuesta: string }) =>
      fetch('/api/whatsapp/faqs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then((r) => r.json()),
    onSuccess: () => { invalidate(); setShowNew(false); setNewPregunta(''); setNewRespuesta(''); toast.success('FAQ creada') },
    onError: () => toast.error('Error al crear la FAQ'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; pregunta?: string; respuesta?: string; activo?: boolean }) =>
      fetch(`/api/whatsapp/faqs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then((r) => r.json()),
    onSuccess: () => { invalidate(); setEditingId(null) },
    onError: () => toast.error('Error al actualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/whatsapp/faqs/${id}`, { method: 'DELETE' }).then((r) => r.json()),
    onSuccess: () => { invalidate(); toast.success('FAQ eliminada') },
    onError: () => toast.error('Error al eliminar'),
  })

  const startEdit = (faq: WhatsAppFaq) => {
    setEditingId(faq.id)
    setEditPregunta(faq.pregunta)
    setEditRespuesta(faq.respuesta)
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Bot size={20} className="text-violet-600" />
            FAQs de Lidia
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Una vez que Lidia termina de calificar al lead, solo responde preguntas de esta lista. Todo lo demás (pedidos de hablar con una persona, reclamos, precios exactos, o lo que no coincida con nada de acá) lo pasa directo a un humano.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 bg-violet-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-violet-700 flex-shrink-0"
        >
          <Plus size={15} /> Nueva FAQ
        </button>
      </div>

      {showNew && (
        <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <h3 className="text-sm font-medium text-slate-700">Nueva FAQ</h3>
          <input
            autoFocus
            type="text"
            placeholder="Pregunta (ej. ¿Qué servicios ofrecen?)"
            value={newPregunta}
            onChange={(e) => setNewPregunta(e.target.value)}
            className="w-full text-sm border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <textarea
            placeholder="Respuesta exacta que va a mandar Lidia"
            value={newRespuesta}
            onChange={(e) => setNewRespuesta(e.target.value)}
            rows={3}
            className="w-full text-sm border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
          />
          <div className="flex gap-2">
            <button
              disabled={!newPregunta.trim() || !newRespuesta.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ pregunta: newPregunta, respuesta: newRespuesta })}
              className="flex items-center gap-1 text-xs bg-violet-600 text-white px-3 py-1.5 rounded hover:bg-violet-700 disabled:opacity-50"
            >
              <Check size={12} /> Guardar
            </button>
            <button
              onClick={() => { setShowNew(false); setNewPregunta(''); setNewRespuesta('') }}
              className="text-xs text-slate-500 px-3 py-1.5 rounded hover:bg-slate-100"
            >
              <X size={12} className="inline mr-1" />Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border rounded-xl divide-y">
        {isLoading ? (
          <p className="text-sm text-slate-400 p-4">Cargando…</p>
        ) : faqs.length === 0 ? (
          <p className="text-sm text-slate-400 italic p-4">No hay FAQs todavía — sin ninguna, Lidia escala todo a un humano después de calificar.</p>
        ) : (
          faqs.map((faq) => (
            <div key={faq.id} className="p-4">
              {editingId === faq.id ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    type="text"
                    value={editPregunta}
                    onChange={(e) => setEditPregunta(e.target.value)}
                    className="w-full text-sm border rounded px-2 py-1.5"
                  />
                  <textarea
                    value={editRespuesta}
                    onChange={(e) => setEditRespuesta(e.target.value)}
                    rows={3}
                    className="w-full text-sm border rounded px-2 py-1.5 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={!editPregunta.trim() || !editRespuesta.trim() || updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: faq.id, pregunta: editPregunta, respuesta: editRespuesta })}
                      className="text-xs bg-violet-600 text-white px-2 py-1 rounded hover:bg-violet-700 disabled:opacity-50"
                    >
                      Guardar
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-slate-100">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', faq.activo ? 'text-slate-800' : 'text-slate-400 line-through')}>
                      {faq.pregunta}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{faq.respuesta}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => updateMutation.mutate({ id: faq.id, activo: !faq.activo })}
                      title={faq.activo ? 'Desactivar' : 'Activar'}
                      className={cn(
                        'px-2 py-1 text-[11px] rounded font-medium',
                        faq.activo ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      )}
                    >
                      {faq.activo ? 'Activa' : 'Inactiva'}
                    </button>
                    <button onClick={() => startEdit(faq)} className="p-1.5 text-slate-400 hover:text-violet-600 rounded hover:bg-slate-100">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => { if (confirm('¿Eliminar esta FAQ?')) deleteMutation.mutate(faq.id) }}
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
