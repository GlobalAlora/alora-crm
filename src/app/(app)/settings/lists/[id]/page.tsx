'use client'

import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, UserMinus } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface LeadRow {
  id: string
  nombre: string
  apellido: string | null
  email: string | null
  empresa: string | null
  estado_pipeline: string
}

export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: listData } = useQuery({
    queryKey: ['list', id],
    queryFn: () => fetch(`/api/lists/${id}`).then((r) => r.json()),
  })

  const { data: leadsData } = useQuery({
    queryKey: ['list-leads', id],
    queryFn: () => fetch(`/api/lists/${id}/leads`).then((r) => r.json()),
  })

  const list = listData?.data
  const leads: LeadRow[] = leadsData?.data ?? []

  const removeMutation = useMutation({
    mutationFn: (lead_id: string) =>
      fetch(`/api/lists/${id}/leads`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['list-leads', id] })
      queryClient.invalidateQueries({ queryKey: ['lists'] })
      toast.success('Lead removido de la lista')
    },
    onError: () => toast.error('Error al remover lead'),
  })

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settings/lists" className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{list?.name ?? '...'}</h1>
          {list?.description && <p className="text-sm text-slate-500">{list.description}</p>}
        </div>
      </div>

      <div className="bg-white border rounded-xl divide-y">
        {leads.length === 0 ? (
          <p className="text-sm text-slate-400 italic p-4">No hay leads en esta lista</p>
        ) : (
          leads.map((lead) => (
            <div key={lead.id} className="flex items-center gap-3 p-3 hover:bg-slate-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">
                  {[lead.nombre, lead.apellido].filter(Boolean).join(' ')}
                </p>
                {lead.empresa && <p className="text-xs text-slate-500">{lead.empresa}</p>}
                {lead.email && <p className="text-xs text-slate-400">{lead.email}</p>}
              </div>
              <button
                onClick={() => removeMutation.mutate(lead.id)}
                className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-slate-100"
                title="Quitar de la lista"
              >
                <UserMinus size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
