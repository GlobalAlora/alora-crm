'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { leadsApi } from '@/lib/api'
import { LeadDetail } from '@/components/leads/LeadDetail'
import { useLeadsRealtime } from '@/hooks/useLeadsRealtime'
import { Suspense } from 'react'

function LeadPageInner() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  // Subscribe to leads/activities realtime so reassignments by other users
  // appear without a manual refresh.
  useLeadsRealtime()

  // "from" param lets us know where to go back: 'contactos' | 'pipeline' (default)
  const from = searchParams.get('from')
  const backHref = from === 'contactos' ? '/contactos' : '/leads'
  const backLabel = from === 'contactos' ? 'Leads' : 'Pipeline'

  const { data: lead, isLoading, isError } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => leadsApi.get(id),
    staleTime: 0,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-slate-400">Cargando lead...</div>
      </div>
    )
  }

  if (isError || !lead) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-slate-500">Lead no encontrado</p>
        <button onClick={() => router.push(backHref)} className="text-sm text-blue-600 hover:underline">
          Volver
        </button>
      </div>
    )
  }

  return (
    <div className="-m-6 h-[calc(100vh-56px)] flex flex-col">
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-white flex-shrink-0">
        <button
          onClick={() => router.push(backHref)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={14} />
          {backLabel}
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-700 font-medium">{lead.nombre}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <LeadDetail
          lead={lead}
          onClose={() => router.push(backHref)}
          onStageChange={() => {}}
          fullPage
        />
      </div>
    </div>
  )
}

export default function LeadPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64 text-sm text-slate-400">Cargando...</div>}>
      <LeadPageInner />
    </Suspense>
  )
}
