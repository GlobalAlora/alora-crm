'use client'

import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { leadsApi } from '@/lib/api'
import { LeadDetail } from '@/components/leads/LeadDetail'
import { useLeadsRealtime } from '@/hooks/useLeadsRealtime'
import { Suspense, useState, useEffect, useCallback } from 'react'

function LeadPageInner() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  useLeadsRealtime()

  const from = searchParams.get('from')
  const backHref = from === 'contactos' ? '/contactos' : '/leads'
  const backLabel = from === 'contactos' ? 'Leads' : 'Pipeline'

  // Prev/next navigation within a kanban stage
  const [navIds, setNavIds] = useState<string[]>([])
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('kanban-nav')
      if (saved) setNavIds(JSON.parse(saved).ids ?? [])
    } catch {}
  }, [])

  const currentIndex = navIds.indexOf(id)
  const prevId = currentIndex > 0 ? navIds[currentIndex - 1] : null
  const nextId = currentIndex !== -1 && currentIndex < navIds.length - 1 ? navIds[currentIndex + 1] : null

  const goTo = useCallback((targetId: string) => {
    router.push(`/leads/${targetId}?from=${from ?? 'pipeline'}`)
  }, [router, from])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft' && prevId) goTo(prevId)
      if (e.key === 'ArrowRight' && nextId) goTo(nextId)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [prevId, nextId, goTo])

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

        {navIds.length > 0 && currentIndex !== -1 && (
          <div className="ml-auto flex items-center gap-1">
            <span className="text-xs text-slate-400 mr-1">{currentIndex + 1} / {navIds.length}</span>
            <button
              onClick={() => prevId && goTo(prevId)}
              disabled={!prevId}
              title="Lead anterior (←)"
              className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} className="text-slate-600" />
            </button>
            <button
              onClick={() => nextId && goTo(nextId)}
              disabled={!nextId}
              title="Lead siguiente (→)"
              className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} className="text-slate-600" />
            </button>
          </div>
        )}
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
