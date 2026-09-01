'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PropuestaDocument } from '@/components/propuestas/PropuestaDocument'
import { PropuestaResumenDocument } from '@/components/propuestas/PropuestaResumenDocument'
import type { PropuestaDocumentos } from '@/types'

interface PropuestaData {
  id: string
  contenido: PropuestaDocumentos
}

export default function PropuestaPublicaPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<PropuestaData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'resumen' | 'detallada'>('resumen')

  useEffect(() => {
    fetch(`/api/propuesta/${id}`)
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error || 'Error')
        setData(json.data)
      })
      .catch((e) => setError(e.message))
  }, [id])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        {error}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Cargando...
      </div>
    )
  }

  return (
    <div className="min-h-screen py-8">
      {data.contenido.resumen && (
        <div className="print:hidden flex justify-center mb-2">
          <div className="inline-flex bg-white border border-slate-200 rounded-full p-1 text-sm">
            <button
              onClick={() => setTab('resumen')}
              className={`px-4 py-1.5 rounded-full transition-colors ${tab === 'resumen' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
            >
              Resumen
            </button>
            <button
              onClick={() => setTab('detallada')}
              className={`px-4 py-1.5 rounded-full transition-colors ${tab === 'detallada' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
            >
              Propuesta completa
            </button>
          </div>
        </div>
      )}

      {tab === 'resumen' && data.contenido.resumen ? (
        <PropuestaResumenDocument contenido={data.contenido.resumen} propuestaId={data.id} />
      ) : (
        <PropuestaDocument contenido={data.contenido.detallada} propuestaId={data.id} />
      )}
    </div>
  )
}
