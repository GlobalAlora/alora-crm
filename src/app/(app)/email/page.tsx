'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Send, Clock, CheckCircle, XCircle, FileText, Trash2 } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import type { Campaign } from '@/types'

const STATUS_BADGE: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  draft:   { label: 'Borrador', icon: <FileText size={11} />,   cls: 'bg-slate-100 text-slate-600' },
  sending: { label: 'Enviando', icon: <Clock size={11} />,      cls: 'bg-amber-100 text-amber-700' },
  sent:    { label: 'Enviada',  icon: <CheckCircle size={11} />, cls: 'bg-emerald-100 text-emerald-700' },
  failed:  { label: 'Fallida',  icon: <XCircle size={11} />,    cls: 'bg-red-100 text-red-700' },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function EmailPage() {
  const queryClient = useQueryClient()

  const { data } = useQuery<{ data: Campaign[] }>({
    queryKey: ['campaigns'],
    queryFn: () => fetch('/api/campaigns').then((r) => r.json()),
    refetchInterval: (q) => {
      const campaigns = q.state.data?.data ?? []
      return campaigns.some((c) => c.status === 'sending') ? 5000 : false
    },
  })

  const campaigns = data?.data ?? []

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Error al eliminar')
      return json
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campaña eliminada') },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Email Marketing</h1>
          <p className="text-sm text-slate-500 mt-0.5">Creá y enviá campañas a tus leads segmentados</p>
        </div>
        <Link
          href="/email/new"
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={15} /> Nueva campaña
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white border border-dashed rounded-xl p-12 text-center">
          <Send size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No hay campañas aún</p>
          <p className="text-sm text-slate-400 mt-1">Creá tu primera campaña de email</p>
          <Link href="/email/new" className="mt-4 inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
            <Plus size={14} /> Crear campaña
          </Link>
        </div>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {campaigns.map((c) => {
            const badge = STATUS_BADGE[c.status] ?? STATUS_BADGE.draft
            return (
              <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <Link href={`/email/${c.id}`} className="text-sm font-medium text-slate-800 hover:text-blue-600">
                    {c.name}
                  </Link>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{c.subject}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatDate(c.created_at)}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {c.status !== 'draft' && (
                    <span className="text-xs text-slate-500">{c.total_sent} enviados</span>
                  )}
                  <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
                    {badge.icon} {badge.label}
                  </span>
                  <button
                    onClick={() => { if (confirm(`¿Eliminar "${c.name}"?`)) deleteMutation.mutate(c.id) }}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-slate-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
