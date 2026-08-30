'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { leadsApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Lead, PipelineStage } from '@/types'
import { useActivePipelineStages } from '@/hooks/usePipelineStages'
import { StatusBadge } from '@/components/shared/StatusBadge'

interface StageSelectorProps {
  leadId: string
  estadoPipeline: PipelineStage
  onStageChange?: (l: Lead) => void
}

export function StageSelector({ leadId, estadoPipeline, onStageChange }: StageSelectorProps) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const stageMutation = useMutation({
    mutationFn: (stage: PipelineStage) => leadsApi.moveStage(leadId, stage),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead', leadId] })
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations'] })
      onStageChange?.(updated)
      toast.success('Estado actualizado')
    },
    onError: () => toast.error('Error al cambiar estado'),
  })

  const activeStages = useActivePipelineStages()

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors bg-white"
      >
        <StatusBadge stage={estadoPipeline} />
        <ChevronDown size={13} className="text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-64 max-h-72 overflow-y-auto">
            {activeStages.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  stageMutation.mutate(s.value)
                  setOpen(false)
                }}
                className={cn(
                  'w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-50',
                  estadoPipeline === s.value && 'font-semibold'
                )}
              >
                <div className="flex items-center">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-2 flex-shrink-0"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </div>
                {s.descripcion && (
                  <p className="text-xs text-slate-400 font-normal mt-0.5 ml-4 leading-snug">{s.descripcion}</p>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
