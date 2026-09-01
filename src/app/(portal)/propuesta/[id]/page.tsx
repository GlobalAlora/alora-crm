'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PropuestaDocument } from '@/components/propuestas/PropuestaDocument'
import type { PropuestaContenido } from '@/types'

interface PropuestaData {
  id: string
  contenido: PropuestaContenido
}

export default function PropuestaPublicaPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<PropuestaData | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      <PropuestaDocument contenido={data.contenido} propuestaId={data.id} />
    </div>
  )
}
