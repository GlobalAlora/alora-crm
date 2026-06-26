'use client'

import { useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LeadSummaryProps {
  leadId: string
}

export function LeadSummary({ leadId }: LeadSummaryProps) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/summary`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error desconocido')
      setSummary(json.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando resumen')
    } finally {
      setLoading(false)
    }
  }

  if (!summary && !loading && !error) {
    return (
      <button
        onClick={generate}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-violet-300 text-xs text-violet-600 hover:bg-violet-50 hover:border-violet-400 transition-colors"
      >
        <Sparkles size={13} />
        Generar resumen con IA
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-violet-700">
          <Sparkles size={12} />
          Resumen IA
        </div>
        {!loading && (
          <button
            onClick={generate}
            className="text-violet-400 hover:text-violet-600 transition-colors"
            title="Regenerar"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-violet-500">
          <RefreshCw size={12} className="animate-spin" />
          Analizando lead...
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {summary && !loading && (
        <p className={cn('text-xs text-slate-700 leading-relaxed')}>
          {summary}
        </p>
      )}
    </div>
  )
}
