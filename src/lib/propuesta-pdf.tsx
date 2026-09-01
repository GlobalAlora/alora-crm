import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { PropuestaContenido } from '@/types'

const BRAND = '#1B4040'
const BRAND_LT = '#E0EEEE'

const styles = StyleSheet.create({
  page: { fontSize: 10.5, color: '#334155', fontFamily: 'Helvetica' },
  header: { backgroundColor: BRAND, paddingVertical: 32, paddingHorizontal: 32, alignItems: 'center' },
  logo: { height: 20, marginBottom: 12 },
  title: { color: '#ffffff', fontSize: 18, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 9, marginTop: 8, textAlign: 'center' },
  body: { padding: 32, paddingTop: 26 },
  section: { marginBottom: 18 },
  sectionTitle: { color: BRAND, fontSize: 9.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7 },
  parrafo: { lineHeight: 1.5, marginBottom: 6 },
  bulletRow: { flexDirection: 'row', marginBottom: 5, alignItems: 'flex-start' },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: BRAND, marginTop: 5, marginRight: 8 },
  bulletDotSub: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#94a3b8', marginTop: 5, marginRight: 8 },
  bulletText: { flex: 1, lineHeight: 1.4 },
  subTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1e293b', marginBottom: 5, marginTop: 8 },
  invBox: { backgroundColor: BRAND_LT, borderRadius: 8, padding: 16 },
  invPaquete: { color: BRAND, fontSize: 9, marginBottom: 4 },
  invMonto: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 8 },
  invFormaPago: { fontSize: 9, color: '#475569' },
  mantBox: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 16 },
  mantMonto: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 8 },
  footer: { marginTop: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', textAlign: 'center', color: '#94a3b8', fontSize: 8 },
})

function formatMonto(monto: number, moneda: 'USD' | 'ARS') {
  const formatted = new Intl.NumberFormat(moneda === 'ARS' ? 'es-AR' : 'en-US', { maximumFractionDigits: 0 }).format(monto)
  return `${moneda} ${formatted}`
}

function PropuestaPdf({ titulo, cliente, bloques, inversion, mantenimiento }: PropuestaContenido) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src="https://globalalora.com/logo-web.png" style={styles.logo} />
          <Text style={styles.title}>{titulo}</Text>
          {cliente && <Text style={styles.subtitle}>Preparado para {cliente}</Text>}
        </View>

        <View style={styles.body}>
          {bloques.map((bloque) => (
            <View key={bloque.id} style={styles.section} wrap={false}>
              <Text style={styles.sectionTitle}>{bloque.titulo}</Text>

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
                <View key={i}>
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

          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Inversión</Text>
            <View style={styles.invBox}>
              <Text style={styles.invPaquete}>{inversion.paquete}</Text>
              <Text style={styles.invMonto}>{formatMonto(inversion.monto, inversion.moneda)}</Text>
              <Text style={styles.invFormaPago}>{inversion.forma_pago}</Text>
            </View>
          </View>

          {mantenimiento && (
            <View style={styles.section} wrap={false}>
              <Text style={styles.sectionTitle}>Mantenimiento (opcional)</Text>
              <View style={styles.mantBox}>
                <Text style={styles.mantMonto}>{formatMonto(mantenimiento.monto_mensual, mantenimiento.moneda)} / mes</Text>
                {mantenimiento.incluye.map((item, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <View style={styles.bulletDotSub} />
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.footer}>Alora — agencia de tecnología digital · globalalora.com</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderPropuestaPdf(contenido: PropuestaContenido): Promise<Buffer> {
  return renderToBuffer(<PropuestaPdf {...contenido} />)
}
