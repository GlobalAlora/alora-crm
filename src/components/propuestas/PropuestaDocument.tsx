'use client'

import { Inter } from 'next/font/google'
import type { PropuestaContenido, PropuestaBloque } from '@/types'
import { BRAND } from '@/lib/alora-brand'
import { renderBoldText } from '@/lib/propuesta-format'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] })

interface PropuestaDocumentProps {
  contenido: PropuestaContenido
  propuestaId?: string
  editable?: boolean
  onChange?: (next: PropuestaContenido) => void
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

function formatMonto(monto: number, moneda: 'USD' | 'ARS') {
  const formatted = new Intl.NumberFormat(moneda === 'ARS' ? 'es-AR' : 'en-US', { maximumFractionDigits: 0 }).format(monto)
  return `${moneda} ${formatted}`
}

function SectionHeader({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: BRAND.turquesa }}>
        {String(n).padStart(2, '0')}
      </span>
      <span className="w-[26px] h-px flex-shrink-0" style={{ background: BRAND.border }} />
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: BRAND.ink }}>
        {label}
      </span>
    </div>
  )
}

type Tag = 'span' | 'p' | 'div' | 'h1'

/** Texto editable in-place: en modo lectura renderiza **negrita**; en modo edición
 * muestra el texto crudo (con los ** visibles) y confirma el cambio al perder foco. */
function EditableText({
  value, editable, onCommit, as = 'span', style, className, multiline,
}: {
  value: string
  editable: boolean
  onCommit: (next: string) => void
  as?: Tag
  style?: React.CSSProperties
  className?: string
  multiline?: boolean
}) {
  const Tag = as
  if (!editable) {
    return <Tag style={style} className={className}>{renderBoldText(value)}</Tag>
  }
  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        const text = (e.currentTarget.textContent ?? '').trim()
        if (text && text !== value) onCommit(text)
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      style={{ ...style, outline: 'none', cursor: 'text' }}
      className={`${className ?? ''} rounded px-0.5 -mx-0.5 hover:bg-blue-50 focus:bg-blue-50 focus:ring-1 focus:ring-blue-300 transition-colors`}
    >
      {value}
    </Tag>
  )
}

export function PropuestaDocument({ contenido, propuestaId, editable, onChange }: PropuestaDocumentProps) {
  // Defensa contra propuestas guardadas en un formato anterior (antes del
  // split detallada/resumen) -- mejor un mensaje claro que un crash de
  // toda la pantalla por un .map() sobre algo que no existe en esa forma.
  if (!contenido || !Array.isArray(contenido.bloques) || !contenido.inversion) {
    return (
      <div className={`${inter.className} flex items-center justify-center py-20 text-sm text-slate-400`}>
        Esta propuesta se guardó en un formato anterior y no se puede previsualizar acá.
      </div>
    )
  }

  const { titulo, cliente, bloques, inversion, mantenimiento } = contenido
  const isEditable = !!(editable && onChange)
  let n = 0

  function patchBloque(idx: number, updater: (b: PropuestaBloque) => PropuestaBloque) {
    if (!onChange) return
    onChange({ ...contenido, bloques: bloques.map((b, i) => (i === idx ? updater(b) : b)) })
  }

  // El cierre va al final de todo el documento (después de inversión y
  // mantenimiento) aunque el agente lo devuelva como un bloque más — un
  // cierre cálido después del precio es mejor que uno en el medio.
  const indexed = bloques.map((bloque, idx) => ({ bloque, idx }))
  const cierreEntry = indexed.find((e) => e.bloque.id === 'cierre') ?? null
  const mainEntries = cierreEntry ? indexed.filter((e) => e !== cierreEntry) : indexed

  function renderBloque(bloque: PropuestaBloque, idx: number, num: number) {
    return (
      <div key={bloque.id} className="mb-9">
        <SectionHeader n={num} label={bloque.titulo} />

        {bloque.parrafos?.map((p, i) => (
          <p key={i} style={{ fontSize: 14, lineHeight: 1.75, color: '#2A2E34', marginBottom: 14 }}>
            <EditableText
              value={p}
              editable={isEditable}
              multiline
              onCommit={(text) => patchBloque(idx, (b) => ({ ...b, parrafos: (b.parrafos ?? []).map((pp, pi) => (pi === i ? text : pp)) }))}
            />
          </p>
        ))}

        {bloque.items && bloque.items.length > 0 && (
          <div className="grid gap-2.5 mt-2">
            {bloque.items.map((item, i) => (
              <div key={i} className="keep flex items-start gap-2.5 rounded-xl px-4 py-3" style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}` }}>
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: BRAND.turquesa }} />
                <span style={{ fontSize: 13, lineHeight: 1.6, color: '#2A2E34' }}>
                  <EditableText
                    value={item}
                    editable={isEditable}
                    multiline
                    onCommit={(text) => patchBloque(idx, (b) => ({ ...b, items: (b.items ?? []).map((it, ii) => (ii === i ? text : it)) }))}
                  />
                </span>
              </div>
            ))}
          </div>
        )}

        {bloque.subsecciones?.map((sub, si) => (
          <div key={si} className={`keep rounded-2xl p-6 bg-white ${si > 0 ? 'mt-3' : 'mt-2'}`} style={{ border: `1px solid ${BRAND.border}` }}>
            <p className="font-bold mb-3" style={{ fontSize: 14, color: BRAND.ink, letterSpacing: '-0.01em' }}>
              <EditableText
                value={sub.titulo}
                editable={isEditable}
                onCommit={(text) => patchBloque(idx, (b) => ({ ...b, subsecciones: (b.subsecciones ?? []).map((s, ssi) => (ssi === si ? { ...s, titulo: text } : s)) }))}
              />
            </p>
            <div className="grid gap-2">
              {sub.items.map((item, j) => (
                <div key={j} className="flex items-start gap-2.5">
                  <span className="mt-1.5 w-1 h-1 rounded-full flex-shrink-0" style={{ background: BRAND.electric }} />
                  <span style={{ fontSize: 12.5, lineHeight: 1.6, color: BRAND.textMuted }}>
                    <EditableText
                      value={item}
                      editable={isEditable}
                      multiline
                      onCommit={(text) => patchBloque(idx, (b) => ({
                        ...b,
                        subsecciones: (b.subsecciones ?? []).map((s, ssi) => (ssi === si ? { ...s, items: s.items.map((it, ii) => (ii === j ? text : it)) } : s)),
                      }))}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={inter.className} style={{ background: '#ffffff' }}>
      {propuestaId && (
        <div className="print:hidden flex justify-end p-4">
          <a
            href={`/api/propuesta/${propuestaId}/pdf?doc=detallada`}
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
              Propuesta de trabajo
            </span>
          </div>
          <h1 className="font-extrabold text-white mb-3" style={{ fontSize: 32, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
            <EditableText
              value={titulo}
              editable={isEditable}
              onCommit={(text) => onChange?.({ ...contenido, titulo: text })}
            />
          </h1>
          {cliente && (
            <div
              className="inline-block rounded-xl px-4 py-3"
              style={{ background: '#12161B', border: '1px solid #22282F' }}
            >
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: BRAND.turquesa, marginBottom: 6 }}>
                Preparada para
              </div>
              <div className="text-white font-semibold" style={{ fontSize: 13.5 }}>
                <EditableText
                  value={cliente}
                  editable={isEditable}
                  onCommit={(text) => onChange?.({ ...contenido, cliente: text })}
                />
              </div>
            </div>
          )}
        </div>

        {/* Bloques (excepto cierre, que va al final) */}
        {mainEntries.map(({ bloque, idx }) => renderBloque(bloque, idx, ++n))}

        {/* Inversión */}
        <div className="mb-9">
          <SectionHeader n={++n} label="Inversión" />
          <div
            className="keep rounded-2xl p-7"
            style={{ background: BRAND.ink, backgroundImage: `radial-gradient(110% 100% at 0% 0%, rgba(6,159,249,0.20) 0%, rgba(144,106,229,0.12) 42%, rgba(7,9,14,0) 74%)` }}
          >
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: BRAND.turquesa, marginBottom: 8 }}>
              <EditableText
                value={inversion.paquete}
                editable={isEditable}
                onCommit={(text) => onChange?.({ ...contenido, inversion: { ...inversion, paquete: text } })}
              />
            </div>
            <div className="font-extrabold text-white mb-3" style={{ fontSize: 34, letterSpacing: '-0.02em' }}>
              {isEditable ? (
                <EditableText
                  value={formatMonto(inversion.monto, inversion.moneda)}
                  editable
                  onCommit={(text) => {
                    const parsed = Number(text.replace(/[^\d.]/g, ''))
                    if (!Number.isNaN(parsed) && parsed > 0) onChange?.({ ...contenido, inversion: { ...inversion, monto: parsed } })
                  }}
                />
              ) : formatMonto(inversion.monto, inversion.moneda)}
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: '#B7BDC6' }}>
              <EditableText
                value={inversion.forma_pago}
                editable={isEditable}
                multiline
                onCommit={(text) => onChange?.({ ...contenido, inversion: { ...inversion, forma_pago: text } })}
              />
            </p>
          </div>
        </div>

        {/* Mantenimiento opcional */}
        {mantenimiento && (
          <div className="mb-9">
            <SectionHeader n={++n} label="Mantenimiento (opcional)" />
            <div className="keep rounded-2xl p-6 bg-white" style={{ border: `1px solid ${BRAND.border}` }}>
              <p className="font-extrabold mb-3" style={{ fontSize: 20, color: BRAND.ink }}>
                {isEditable ? (
                  <EditableText
                    value={formatMonto(mantenimiento.monto_mensual, mantenimiento.moneda)}
                    editable
                    onCommit={(text) => {
                      const parsed = Number(text.replace(/[^\d.]/g, ''))
                      if (!Number.isNaN(parsed) && parsed > 0) onChange?.({ ...contenido, mantenimiento: { ...mantenimiento, monto_mensual: parsed } })
                    }}
                  />
                ) : formatMonto(mantenimiento.monto_mensual, mantenimiento.moneda)}{' '}
                <span className="font-normal" style={{ fontSize: 12, color: BRAND.textMuted }}>/ mes</span>
              </p>
              <div className="grid gap-1.5">
                {mantenimiento.incluye.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: BRAND.violeta }} />
                    <span style={{ fontSize: 12.5, lineHeight: 1.55, color: BRAND.textMuted }}>
                      <EditableText
                        value={item}
                        editable={isEditable}
                        multiline
                        onCommit={(text) => onChange?.({
                          ...contenido,
                          mantenimiento: { ...mantenimiento, incluye: mantenimiento.incluye.map((it, ii) => (ii === i ? text : it)) },
                        })}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cierre (siempre al final) */}
        {cierreEntry && renderBloque(cierreEntry.bloque, cierreEntry.idx, ++n)}

        {/* Footer */}
        <div
          className="flex justify-between items-center pt-3"
          style={{ borderTop: `1px solid ${BRAND.border}`, fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: BRAND.textMuted }}
        >
          <span className="font-extrabold" style={{ color: BRAND.ink, letterSpacing: '0.2em' }}>ALORA</span>
          <span>Propuesta comercial · Confidencial · globalalora.com</span>
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
