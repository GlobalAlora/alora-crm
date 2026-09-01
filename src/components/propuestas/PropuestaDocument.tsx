'use client'

import type { PropuestaContenido } from '@/types'

interface PropuestaDocumentProps {
  contenido: PropuestaContenido
  moneda: 'USD' | 'ARS'
  monto: number | null
  leadNombre?: string
  leadEmpresa?: string | null
  propuestaId?: string
}

const BRAND = '#1B4040'
const BRAND_BG = '#EEF4F4'
const BRAND_LT = '#E0EEEE'

function formatMonto(monto: number | null, moneda: 'USD' | 'ARS') {
  if (monto == null) return '—'
  const formatted = new Intl.NumberFormat(moneda === 'ARS' ? 'es-AR' : 'en-US', { maximumFractionDigits: 0 }).format(monto)
  return `${moneda} ${formatted}`
}

export function PropuestaDocument({ contenido, moneda, monto, leadNombre, leadEmpresa, propuestaId }: PropuestaDocumentProps) {
  return (
    <div
      className="propuesta-doc mx-auto max-w-2xl print:max-w-none"
      style={{ background: BRAND_BG }}
    >
      {propuestaId && (
        <div className="print:hidden flex justify-end p-4">
          <a
            href={`/api/propuesta/${propuestaId}/pdf`}
            download
            className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
            style={{ background: BRAND }}
          >
            Descargar PDF
          </a>
        </div>
      )}

      <div className="px-6 pb-10 print:p-0">
        <div className="rounded-2xl overflow-hidden shadow-sm print:shadow-none print:rounded-none">
          {/* Header */}
          <div className="text-center py-10 px-6" style={{ background: BRAND }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://globalalora.com/logo-web.png"
              alt="Alora"
              className="h-9 mx-auto mb-4"
              style={{ filter: 'brightness(0) invert(1)' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <h1 className="text-white text-2xl font-bold">{contenido.titulo}</h1>
            {(leadNombre || leadEmpresa) && (
              <p className="text-white/70 text-sm mt-2">
                Preparado para {[leadNombre, leadEmpresa].filter(Boolean).join(' — ')}
              </p>
            )}
          </div>

          {/* Body */}
          <div className="bg-white px-6 py-8 md:px-10 md:py-10 space-y-8">
            <p className="text-slate-700 leading-relaxed">{contenido.resumen}</p>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: BRAND }}>Alcance</h2>
              <ul className="space-y-2">
                {contenido.alcance.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-slate-700">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: BRAND }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: BRAND }}>Entregables</h2>
              <ul className="space-y-2">
                {contenido.entregables.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-slate-700">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: BRAND }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl p-5" style={{ background: BRAND_LT }}>
                <p className="text-xs mb-1" style={{ color: BRAND }}>Cronograma estimado</p>
                <p className="text-base font-semibold text-slate-800">{contenido.cronograma}</p>
              </div>
              <div className="rounded-xl p-5" style={{ background: BRAND_LT }}>
                <p className="text-xs mb-1" style={{ color: BRAND }}>Inversión estimada</p>
                <p className="text-xl font-bold text-slate-900">{formatMonto(monto, moneda)}</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center pt-4 border-t border-slate-100">
              Alora — agencia de tecnología digital · globalalora.com
            </p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          @page { margin: 0; }
          body { background: white !important; margin: 0 !important; }
          .propuesta-doc { padding: 0 !important; background: white !important; }
        }
      `}</style>
    </div>
  )
}
