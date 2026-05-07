'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[AppError]', error)
  }, [error])

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm w-full text-center space-y-4">
        <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle size={18} className="text-red-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Error al cargar</h2>
          <p className="text-sm text-slate-500 mt-1">
            {error.message || 'Ocurrió un error inesperado en esta sección.'}
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
