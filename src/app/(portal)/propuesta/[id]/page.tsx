'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PropuestaDocument } from '@/components/propuestas/PropuestaDocument'
import type { PropuestaContenido } from '@/types'

interface PropuestaData {
  id: string
  moneda: 'USD' | 'ARS'
  valor_usd: number | null
  valor_ars: number | null
  contenido: PropuestaContenido
  lead: { nombre: string; apellido: string | null; empresa: string | null } | { nombre: string; apellido: string | null; empresa: string | null }[] | null
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

  const lead = Array.isArray(data.lead) ? data.lead[0] : data.lead
  const monto = data.moneda === 'ARS' ? data.valor_ars : data.valor_usd

  return (
    <div className="min-h-screen py-8">
      <PropuestaDocument
        contenido={data.contenido}
        moneda={data.moneda}
        monto={monto}
        leadNombre={lead ? [lead.nombre, lead.apellido].filter(Boolean).join(' ') : undefined}
        leadEmpresa={lead?.empresa}
        propuestaId={data.id}
      />
    </div>
  )
}
