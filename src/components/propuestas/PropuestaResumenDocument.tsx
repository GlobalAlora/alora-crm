'use client'

import { Inter } from 'next/font/google'
import type { PropuestaResumenEjecutivo } from '@/types'
import { BRAND } from '@/lib/alora-brand'
import { renderBoldText } from '@/lib/propuesta-format'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] })

interface Props {
  contenido: PropuestaResumenEjecutivo
  propuestaId?: string
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

function formatMonto(monto: number, moneda: 'USD' | 'ARS') {
  const formatted = new Intl.NumberFormat(moneda === 'ARS' ? 'es-AR' : 'en-US', { maximumFractionDigits: 0 }).format(monto)
  return `${moneda} ${formatted}`
}

function Label({ children }: { children: string }) {
  return (
    <p style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: BRAND.textMuted, marginBottom: 10 }}>
      {children}
    </p>
  )
}

export function PropuestaResumenDocument({ contenido, propuestaId }: Props) {
  const { titulo, cliente, hallazgos, propuesta, incluye, no_incluye, inversion, tiempos } = contenido

  return (
    <div className={inter.className} style={{ background: '#ffffff' }}>
      {propuestaId && (
        <div className="print:hidden flex justify-end p-4">
          <a
            href={`/api/propuesta/${propuestaId}/pdf?doc=resumen`}
            download
            className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
            style={{ background: BRAND.ink }}
          >
            Descargar PDF
          </a>
        </div>
      )}

      <div className="mx-auto max-w-2xl px-6 pb-16 print:max-w-none print:px-0" style={{ color: '#2A2E34' }}>
        {/* Cover */}
        <div
          className="keep rounded-[20px] p-9 pb-8 mb-9"
          style={{ background: BRAND.ink, backgroundImage: `radial-gradient(120% 90% at 88% 4%, rgba(0,189,190,0.22) 0%, rgba(6,159,249,0.10) 34%, rgba(7,9,14,0) 68%)` }}
        >
          <div className="font-extrabold text-white mb-8" style={{ fontSize: 22, letterSpacing: '0.26em' }}>ALORA</div>
          <div
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 mb-5"
            style={{ border: `1px solid ${BRAND.inkSoft}`, background: '#12161B' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: BRAND.turquesa }} />
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9CED6' }}>
              Resumen ejecutivo
            </span>
          </div>
          <h1 className="font-extrabold text-white mb-3" style={{ fontSize: 30, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
            {titulo}
          </h1>
          {cliente && <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>Preparado para {cliente}</p>}
        </div>

        {/* Hallazgos */}
        <div className="mb-8">
          <Label>Lo que encontramos</Label>
          <div className="grid gap-2">
            {hallazgos.map((h, i) => (
              <div key={i} className="keep flex items-start gap-2.5 rounded-xl px-4 py-3 bg-white" style={{ border: `1px solid ${BRAND.border}` }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: BRAND.electric }} />
                <span style={{ fontSize: 13, lineHeight: 1.6 }}>{renderBoldText(h)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Propuesta */}
        <div className="mb-8">
          <Label>Lo que proponemos</Label>
          <p style={{ fontSize: 14, lineHeight: 1.75 }}>{renderBoldText(propuesta)}</p>
        </div>

        {/* Incluye / No incluye */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div>
            <Label>Incluye</Label>
            <div className="grid gap-2">
              {incluye.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: BRAND.turquesa }} />
                  <span style={{ fontSize: 12.5, lineHeight: 1.55 }}>{renderBoldText(item)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label>No incluye</Label>
            <div className="grid gap-2">
              {no_incluye.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: BRAND.textMuted }} />
                  <span style={{ fontSize: 12.5, lineHeight: 1.55, color: BRAND.textMuted }}>{renderBoldText(item)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Inversión + tiempos */}
        <div
          className="keep rounded-2xl p-7"
          style={{ background: BRAND.ink, backgroundImage: `radial-gradient(110% 100% at 0% 0%, rgba(6,159,249,0.20) 0%, rgba(144,106,229,0.12) 42%, rgba(7,9,14,0) 74%)` }}
        >
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: BRAND.turquesa, marginBottom: 8 }}>
                Inversión — {inversion.paquete}
              </div>
              <div className="font-extrabold text-white mb-2" style={{ fontSize: 28, letterSpacing: '-0.02em' }}>
                {formatMonto(inversion.monto, inversion.moneda)}
              </div>
              <p style={{ fontSize: 11.5, lineHeight: 1.5, color: '#B7BDC6' }}>{renderBoldText(inversion.forma_pago)}</p>
            </div>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: BRAND.electric, marginBottom: 8 }}>
                Tiempos
              </div>
              <p className="text-white font-semibold" style={{ fontSize: 14 }}>{tiempos}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex justify-between items-center pt-3 mt-9"
          style={{ borderTop: `1px solid ${BRAND.border}`, fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: BRAND.textMuted }}
        >
          <span className="font-extrabold" style={{ color: BRAND.ink, letterSpacing: '0.2em' }}>ALORA</span>
          <span>Resumen ejecutivo · Confidencial · globalalora.com</span>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          @page { margin: 0.6in; }
          body { background: white !important; margin: 0 !important; }
          .keep { break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}
