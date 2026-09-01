import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { PropuestaContenido } from '@/types'

const BRAND = '#1B4040'
const BRAND_BG = '#EEF4F4'
const BRAND_LT = '#E0EEEE'
const INK = '#0f172a'
const MUTED = '#475569'

const styles = StyleSheet.create({
  page: { fontSize: 10.5, color: '#334155', fontFamily: 'Helvetica', backgroundColor: '#ffffff' },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32, paddingVertical: 10, backgroundColor: BRAND },
  topBarWordmark: { color: '#ffffff', fontSize: 8.5, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5 },
  topBarSite: { color: 'rgba(255,255,255,0.65)', fontSize: 7.5 },

  hero: { backgroundColor: BRAND, paddingVertical: 30, paddingHorizontal: 32, alignItems: 'center' },
  logo: { height: 20, marginBottom: 14 },
  title: { color: '#ffffff', fontSize: 19, fontFamily: 'Helvetica-Bold', textAlign: 'center', lineHeight: 1.3 },
  subtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 9.5, marginTop: 10, textAlign: 'center' },

  body: { padding: 32, paddingTop: 26 },

  block: { marginBottom: 16, borderLeftWidth: 2.5, borderLeftColor: BRAND_LT, paddingLeft: 14 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND, marginRight: 7 },
  sectionTitle: { color: BRAND, fontSize: 10, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8 },

  parrafo: { lineHeight: 1.55, marginBottom: 7, color: '#334155' },

  bulletRow: { flexDirection: 'row', marginBottom: 6, alignItems: 'flex-start' },
  bulletDot: { width: 4.5, height: 4.5, borderRadius: 2.25, backgroundColor: BRAND, marginTop: 5, marginRight: 9 },
  bulletText: { flex: 1, lineHeight: 1.5 },

  subBox: { backgroundColor: BRAND_BG, borderRadius: 6, padding: 12, marginTop: 8 },
  subTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 6 },
  bulletDotSub: { width: 3.5, height: 3.5, borderRadius: 1.75, backgroundColor: BRAND, opacity: 0.6, marginTop: 5, marginRight: 9 },

  invCard: { backgroundColor: BRAND, borderRadius: 10, padding: 20, marginBottom: 14 },
  invPaquete: { color: 'rgba(255,255,255,0.75)', fontSize: 9, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  invMonto: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#ffffff', marginBottom: 10 },
  invFormaPago: { fontSize: 9, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 },

  mantCard: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 18, marginBottom: 14 },
  mantMonto: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 10 },

  footer: { position: 'absolute', bottom: 20, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8 },
  footerText: { fontSize: 7.5, color: '#94a3b8' },
})

function formatMonto(monto: number, moneda: 'USD' | 'ARS') {
  const formatted = new Intl.NumberFormat(moneda === 'ARS' ? 'es-AR' : 'en-US', { maximumFractionDigits: 0 }).format(monto)
  return `${moneda} ${formatted}`
}

function SectionTitle({ children }: { children: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionDot} />
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  )
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Alora — agencia de tecnología digital</Text>
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  )
}

function PropuestaPdf({ titulo, cliente, bloques, inversion, mantenimiento }: PropuestaContenido) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.topBar} fixed>
          <Text style={styles.topBarWordmark}>ALORA</Text>
          <Text style={styles.topBarSite}>globalalora.com</Text>
        </View>

        <View style={styles.hero}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src="https://globalalora.com/logo-web.png" style={styles.logo} />
          <Text style={styles.title}>{titulo}</Text>
          {cliente && <Text style={styles.subtitle}>Preparado para {cliente}</Text>}
        </View>

        <View style={styles.body}>
          {bloques.map((bloque) => (
            <View key={bloque.id} style={styles.block} wrap={false}>
              <SectionTitle>{bloque.titulo}</SectionTitle>

              {bloque.parrafos?.map((p, i) => (
                <Text key={i} style={styles.parrafo}>{p}</Text>
              ))}

              {bloque.items?.map((item, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}

              {bloque.subsecciones?.map((sub, i) => (
                <View key={i} style={styles.subBox}>
                  <Text style={styles.subTitle}>{sub.titulo}</Text>
                  {sub.items.map((item, j) => (
                    <View key={j} style={styles.bulletRow}>
                      <View style={styles.bulletDotSub} />
                      <Text style={styles.bulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          ))}

          <View wrap={false}>
            <SectionTitle>Inversión</SectionTitle>
            <View style={styles.invCard}>
              <Text style={styles.invPaquete}>{inversion.paquete}</Text>
              <Text style={styles.invMonto}>{formatMonto(inversion.monto, inversion.moneda)}</Text>
              <Text style={styles.invFormaPago}>{inversion.forma_pago}</Text>
            </View>
          </View>

          {mantenimiento && (
            <View wrap={false}>
              <SectionTitle>Mantenimiento (opcional)</SectionTitle>
              <View style={styles.mantCard}>
                <Text style={styles.mantMonto}>{formatMonto(mantenimiento.monto_mensual, mantenimiento.moneda)} <Text style={{ fontSize: 10, fontFamily: 'Helvetica', color: MUTED }}>/ mes</Text></Text>
                {mantenimiento.incluye.map((item, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{item}</Text>
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
