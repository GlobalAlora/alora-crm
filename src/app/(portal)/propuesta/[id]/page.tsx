'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { PropuestaDocument } from '@/components/propuestas/PropuestaDocument'
import { PropuestaResumenDocument } from '@/components/propuestas/PropuestaResumenDocument'
import type { PropuestaDocumentos } from '@/types'

interface PropuestaData {
  id: string
  contenido: PropuestaDocumentos
}

const WHATSAPP_NUMERO = '5491124629452'

function linkWhatsapp(texto: string) {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(texto)}`
}

export default function PropuestaPublicaPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<PropuestaData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'resumen' | 'detallada'>('resumen')
  const vistaRegistrada = useRef(false)

  function trackEvento(tipo: 'vista' | 'aceptar' | 'dudas' | 'contacto') {
    fetch(`/api/propuesta/${id}/evento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo }),
    }).catch(() => {})
  }

  useEffect(() => {
    fetch(`/api/propuesta/${id}`)
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error || 'Error')
        setData(json.data)
        if (!vistaRegistrada.current) {
          vistaRegistrada.current = true
          trackEvento('vista')
        }
      })
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const titulo = data.contenido.detallada.titulo

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

      <div className="print:hidden mx-auto max-w-2xl px-6 pb-16 flex flex-col items-center gap-3">
        <a
          href={linkWhatsapp(`Hola! Quiero aceptar la propuesta "${titulo}" y comenzar ahora con el 15% de descuento.`)}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackEvento('aceptar')}
          className="w-full text-center px-5 py-3.5 rounded-xl text-white font-semibold text-sm hover:opacity-90 transition-opacity"
          style={{ background: '#00BDBE' }}
        >
          Aceptar propuesta y comenzar ahora — 15% off
        </a>
        <a
          href={linkWhatsapp(`Hola! Tengo dudas sobre la propuesta "${titulo}".`)}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackEvento('dudas')}
          className="w-full text-center px-5 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition-colors"
        >
          Tengo dudas sobre la propuesta
        </a>
        <a
          href={linkWhatsapp(`Hola! Te escribo por la propuesta "${titulo}".`)}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackEvento('contacto')}
          className="text-xs text-slate-400 hover:text-slate-600 underline"
        >
          Escribinos directo por WhatsApp
        </a>
      </div>
    </div>
  )
}
