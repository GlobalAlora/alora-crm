'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-md w-full text-center space-y-4">
        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle size={22} className="text-red-500" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Algo salió mal</h1>
        <p className="text-sm text-slate-500">
          Ocurrió un error inesperado. Podés intentar recargar la página.
        </p>
        {error.digest && (
          <p className="text-xs text-slate-300 font-mono">ID: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="w-full bg-blue-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Reintentar
        </button>
        <button
          onClick={() => window.location.href = '/'}
          className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors"
        >
          Ir al inicio
        </button>
      </div>
    </div>
  )
}
