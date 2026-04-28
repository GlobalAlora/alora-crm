'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import type { Lead } from '@/types'
import { PIPELINE_STAGE_MAP } from '@/types'
import { InlineEdit } from '@/components/shared/InlineEdit'

interface StageHistorySectionProps {
  lead: Lead
}

export function StageHistorySection({ lead }: StageHistorySectionProps) {
  const queryClient = useQueryClient()
  const history = lead.stage_history || []

  const updateMutation = useMutation({
    mutationFn: ({ id, fecha_ingreso }: { id: string; fecha_ingreso: string }) => {
      return fetch(`/api/stage-history/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_ingreso }),
      }).then(res => res.json())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] })
    },
  })

  if (history.length === 0) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={14} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-700">Historial de etapas</h3>
        </div>
        <p className="text-xs text-slate-400 italic">Sin historial de cambios de etapa</p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={14} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">Historial de etapas</h3>
      </div>
      <div className="space-y-2">
        {history.map((entry) => {
          const config = PIPELINE_STAGE_MAP[entry.etapa]
          return (
            <div key={entry.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: config.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700">{config.label}</p>
                <InlineEdit
                  value={entry.fecha_ingreso?.split('T')[0] || ''}
                  onSave={(v) => updateMutation.mutate({ id: entry.id, fecha_ingreso: v })}
                  type="date"
                  isLoading={updateMutation.isPending}
                  placeholder="Sin fecha"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
