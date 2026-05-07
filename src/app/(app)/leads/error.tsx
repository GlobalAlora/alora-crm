'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function LeadsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[LeadsError]', error)
  }, [error])

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle size={18} className="text-red-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Error al cargar leads</h2>
          <p className="text-sm text-slate-500 mt-1">
            {error.message || 'No se pudieron cargar los leads.'}
          </p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-2 mx-auto bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw size={13} /> Reintentar
        </button>
      </div>
    </div>
  )
}
