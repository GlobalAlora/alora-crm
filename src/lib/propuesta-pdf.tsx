import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { PropuestaContenido, PropuestaResumenEjecutivo } from '@/types'
import { BRAND } from './alora-brand'

// react-pdf renders with its built-in Helvetica rather than Inter (the web
// version's font) — registering a remote font adds a real failure mode
// (fetch at render time) for a typeface difference that matters far less
// than the color/layout system actually matching. Same brand tokens as the
// web preview otherwise.
const styles = StyleSheet.create({
  page: { fontSize: 10.5, color: '#2A2E34', fontFamily: 'Helvetica', backgroundColor: BRAND.surfaceSoft },
  content: { padding: 28 },

  cover: { backgroundColor: BRAND.ink, borderRadius: 16, padding: 26, marginBottom: 22 },
  coverWordmark: { color: '#ffffff', fontSize: 15, fontFamily: 'Helvetica-Bold', letterSpacing: 3, marginBottom: 18 },
  coverBadgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  coverDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: BRAND.turquesa, marginRight: 6 },
  coverBadge: { color: '#C9CED6', fontSize: 8, letterSpacing: 1.2, textTransform: 'uppercase' },
  coverTitle: { color: '#ffffff', fontSize: 21, fontFamily: 'Helvetica-Bold', lineHeight: 1.25, marginBottom: 14 },
  coverClientBox: { backgroundColor: '#12161B', borderRadius: 8, padding: 12, alignSelf: 'flex-start' },
  coverClientLabel: { color: BRAND.turquesa, fontSize: 7.5, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 5 },
  coverClientName: { color: '#ffffff', fontSize: 11, fontFamily: 'Helvetica-Bold' },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  sectionN: { fontSize: 8.5, color: BRAND.textMuted, marginRight: 8 },
  sectionLine: { width: 20, height: 1, backgroundColor: BRAND.border, marginRight: 8 },
  sectionLabel: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: BRAND.textMuted, fontFamily: 'Helvetica-Bold' },

  block: { marginBottom: 18 },
  parrafo: { lineHeight: 1.6, marginBottom: 7, fontSize: 10 },

  itemCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: BRAND.surface, borderWidth: 1, borderColor: BRAND.border, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 5 },
  itemDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: BRAND.turquesa, marginTop: 4, marginRight: 8 },
  itemText: { flex: 1, fontSize: 9.5, lineHeight: 1.45 },

  subCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: BRAND.border, borderRadius: 10, padding: 12, marginTop: 6 },
  subTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND.ink, marginBottom: 6 },
  subItemRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 },
  subDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: BRAND.electric, marginTop: 4, marginRight: 8 },
  subItemText: { flex: 1, fontSize: 9, lineHeight: 1.45, color: BRAND.textMuted },

  invCard: { backgroundColor: BRAND.ink, borderRadius: 14, padding: 20 },
  invPaquete: { color: BRAND.turquesa, fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  invMonto: { fontSize: 26, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 10 },
  invFormaPago: { fontSize: 9, color: '#B7BDC6', lineHeight: 1.5 },

  mantCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: BRAND.border, borderRadius: 14, padding: 18 },
  mantMonto: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: BRAND.ink, marginBottom: 10 },

  footer: { position: 'absolute', bottom: 20, left: 28, right: 28, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: BRAND.border, paddingTop: 8 },
  footerWordmark: { fontSize: 7.5, letterSpacing: 1.5, fontFamily: 'Helvetica-Bold', color: BRAND.ink },
  footerText: { fontSize: 7, color: BRAND.textMuted },

  label: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: BRAND.textMuted, marginBottom: 8, fontFamily: 'Helvetica-Bold' },
  twoCol: { flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  coverSubtitlePlain: { color: 'rgba(255,255,255,0.7)', fontSize: 10.5, marginTop: 4 },
  resumenInvCard: { backgroundColor: BRAND.ink, borderRadius: 14, padding: 20, flexDirection: 'row', gap: 24 },
})

function formatMonto(monto: number, moneda: 'USD' | 'ARS') {
  const formatted = new Intl.NumberFormat(moneda === 'ARS' ? 'es-AR' : 'en-US', { maximumFractionDigits: 0 }).format(monto)
  return `${moneda} ${formatted}`
}

function SectionHeader({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionN}>{String(n).padStart(2, '0')}</Text>
      <View style={styles.sectionLine} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  )
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerWordmark}>ALORA</Text>
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Propuesta comercial · Confidencial · Página ${pageNumber} de ${totalPages}`} />
    </View>
  )
}

function PropuestaPdf({ titulo, cliente, bloques, inversion, mantenimiento }: PropuestaContenido) {
  let n = 0
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.content}>
          <View style={styles.cover} wrap={false}>
            <Text style={styles.coverWordmark}>ALORA</Text>
            <View style={styles.coverBadgeRow}>
              <View style={styles.coverDot} />
              <Text style={styles.coverBadge}>Propuesta de trabajo</Text>
            </View>
            <Text style={styles.coverTitle}>{titulo}</Text>
            {cliente && (
              <View style={styles.coverClientBox}>
                <Text style={styles.coverClientLabel}>Preparada para</Text>
                <Text style={styles.coverClientName}>{cliente}</Text>
              </View>
            )}
          </View>

          {bloques.map((bloque) => {
            n++
            return (
              <View key={bloque.id} style={styles.block} wrap={false}>
                <SectionHeader n={n} label={bloque.titulo} />

                {bloque.parrafos?.map((p, i) => (
                  <Text key={i} style={styles.parrafo}>{p}</Text>
                ))}

                {bloque.items?.map((item, i) => (
                  <View key={i} style={styles.itemCard}>
                    <View style={styles.itemDot} />
                    <Text style={styles.itemText}>{item}</Text>
                  </View>
                ))}

                {bloque.subsecciones?.map((sub, i) => (
                  <View key={i} style={styles.subCard}>
                    <Text style={styles.subTitle}>{sub.titulo}</Text>
                    {sub.items.map((item, j) => (
                      <View key={j} style={styles.subItemRow}>
                        <View style={styles.subDot} />
                        <Text style={styles.subItemText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )
          })}

          <View style={styles.block} wrap={false}>
            <SectionHeader n={++n} label="Inversión" />
            <View style={styles.invCard}>
              <Text style={styles.invPaquete}>{inversion.paquete}</Text>
              <Text style={styles.invMonto}>{formatMonto(inversion.monto, inversion.moneda)}</Text>
              <Text style={styles.invFormaPago}>{inversion.forma_pago}</Text>
            </View>
          </View>

          {mantenimiento && (
            <View style={styles.block} wrap={false}>
              <SectionHeader n={++n} label="Mantenimiento (opcional)" />
              <View style={styles.mantCard}>
                <Text style={styles.mantMonto}>{formatMonto(mantenimiento.monto_mensual, mantenimiento.moneda)} <Text style={{ fontSize: 10, fontFamily: 'Helvetica', color: BRAND.textMuted }}>/ mes</Text></Text>
                {mantenimiento.incluye.map((item, i) => (
                  <View key={i} style={styles.itemCard}>
                    <View style={styles.itemDot} />
                    <Text style={styles.itemText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        <Footer />
      </Page>
    </Document>
  )
}

export async function renderPropuestaPdf(contenido: PropuestaContenido): Promise<Buffer> {
  return renderToBuffer(<PropuestaPdf {...contenido} />)
}

function PropuestaResumenPdf({ titulo, cliente, hallazgos, propuesta, incluye, no_incluye, inversion, tiempos }: PropuestaResumenEjecutivo) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.content}>
          <View style={styles.cover} wrap={false}>
            <Text style={styles.coverWordmark}>ALORA</Text>
            <View style={styles.coverBadgeRow}>
              <View style={styles.coverDot} />
              <Text style={styles.coverBadge}>Resumen ejecutivo</Text>
            </View>
            <Text style={styles.coverTitle}>{titulo}</Text>
            {cliente && <Text style={styles.coverSubtitlePlain}>Preparado para {cliente}</Text>}
          </View>

          <View style={styles.block} wrap={false}>
            <Text style={styles.label}>Lo que encontramos</Text>
            {hallazgos.map((h, i) => (
              <View key={i} style={styles.itemCard}>
                <View style={styles.itemDot} />
                <Text style={styles.itemText}>{h}</Text>
              </View>
            ))}
          </View>

          <View style={styles.block} wrap={false}>
            <Text style={styles.label}>Lo que proponemos</Text>
            <Text style={styles.parrafo}>{propuesta}</Text>
          </View>

          <View style={[styles.twoCol, styles.block]} wrap={false}>
            <View style={styles.col}>
              <Text style={styles.label}>Incluye</Text>
              {incluye.map((item, i) => (
                <View key={i} style={styles.subItemRow}>
                  <View style={styles.itemDot} />
                  <Text style={styles.subItemText}>{item}</Text>
                </View>
              ))}
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>No incluye</Text>
              {no_incluye.map((item, i) => (
                <View key={i} style={styles.subItemRow}>
                  <View style={[styles.subDot, { backgroundColor: BRAND.textMuted }]} />
                  <Text style={styles.subItemText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.resumenInvCard} wrap={false}>
            <View style={styles.col}>
              <Text style={[styles.invPaquete, { marginBottom: 6 }]}>Inversión — {inversion.paquete}</Text>
              <Text style={[styles.invMonto, { fontSize: 22, marginBottom: 6 }]}>{formatMonto(inversion.monto, inversion.moneda)}</Text>
              <Text style={styles.invFormaPago}>{inversion.forma_pago}</Text>
            </View>
            <View style={styles.col}>
              <Text style={[styles.invPaquete, { color: BRAND.electric, marginBottom: 6 }]}>Tiempos</Text>
              <Text style={{ color: '#ffffff', fontSize: 12, fontFamily: 'Helvetica-Bold' }}>{tiempos}</Text>
            </View>
          </View>
        </View>

        <Footer />
      </Page>
    </Document>
  )
}

export async function renderResumenPdf(contenido: PropuestaResumenEjecutivo): Promise<Buffer> {
  return renderToBuffer(<PropuestaResumenPdf {...contenido} />)
}
