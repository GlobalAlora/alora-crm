'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Users } from 'lucide-react'
import { LeadTable } from '@/components/leads/LeadTable'
import { useLeadsRealtime } from '@/hooks/useLeadsRealtime'
import type { Lead } from '@/types'

function ContactosContent() {
  const router = useRouter()
  useLeadsRealtime()

  const handleLeadClick = (lead: Lead) => {
    router.push(`/leads/${lead.id}?from=contactos`)
  }

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-white flex-shrink-0">
        <Users size={18} className="text-slate-500" />
        <h1 className="text-base font-semibold text-slate-900">Leads</h1>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden px-6 py-4">
        <LeadTable onLeadClick={handleLeadClick} />
      </div>
    </div>
  )
}

export default function ContactosPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400">Cargando...</div>}>
      <ContactosContent />
    </Suspense>
  )
}
