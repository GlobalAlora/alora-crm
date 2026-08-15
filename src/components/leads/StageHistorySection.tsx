'use client'

import { ArrowRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { useStageMap } from '@/hooks/usePipelineStages'
import type { StageHistory } from '@/types'

interface StageHistorySectionProps {
  history?: StageHistory[]
}

export function StageHistorySection({ history = [] }: StageHistorySectionProps) {
  const stageMap = useStageMap()

  if (history.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-6">Sin historial de estados.</p>
  }

  return (
    <div className="space-y-2">
      {history.map((h, i) => {
        const stageLabel = stageMap[h.etapa]?.label ?? h.etapa
        const next = history[i - 1]
        return (
          <div key={h.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-slate-800">{stageLabel}</span>
                {next && (
                  <>
                    <ArrowRight size={12} className="text-slate-300" />
                    <span className="text-sm text-slate-500">{stageMap[next.etapa]?.label ?? next.etapa}</span>
                  </>
                )}
              </div>
            </div>
            <span className="text-xs text-slate-400 flex-shrink-0">{formatDate(h.fecha_ingreso)}</span>
          </div>
        )
      })}
    </div>
  )
}
