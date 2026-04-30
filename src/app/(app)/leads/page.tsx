'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { LeadDetail } from '@/components/leads/LeadDetail'
import { LeadTable } from '@/components/leads/LeadTable'
import { useLeadsRealtime } from '@/hooks/useLeadsRealtime'
import type { Lead } from '@/types'

type View = 'kanban' | 'list'

export default function LeadsPage() {
  const router = useRouter()
  const [view, setView] = useState<View>('kanban')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  useLeadsRealtime()

  
  const handleLeadClick = (lead: Lead) => {
    if (view === 'list') {
      router.push(`/leads/${lead.id}?from=pipeline`)
    } else {
      setSelectedLead(lead)
    }
  }

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b bg-white flex-shrink-0">
        <div className="flex items-center border rounded-md overflow-hidden">
          <button
            onClick={() => setView('kanban')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors',
              view === 'kanban'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            <LayoutGrid size={14} />
            Kanban
          </button>
          <button
            onClick={() => setView('list')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors',
              view === 'list'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            <List size={14} />
            Lista
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden px-6 py-4">
        {view === 'kanban' && (
          <KanbanBoard onLeadClick={handleLeadClick} />
        )}
        {view === 'list' && (
          <LeadTable onLeadClick={handleLeadClick} />
        )}
      </div>

      {/* Lead detail slide-over (solo para kanban) */}
      {selectedLead && view === 'kanban' && (
        <LeadDetail
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStageChange={(updatedLead) => setSelectedLead(updatedLead)}
        />
      )}
    </div>
  )
}
