import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { PropuestaContenido } from '@/types'

const BRAND = '#1B4040'
const BRAND_LT = '#E0EEEE'

const styles = StyleSheet.create({
  page: { fontSize: 11, color: '#334155', fontFamily: 'Helvetica' },
  header: { backgroundColor: BRAND, paddingVertical: 36, paddingHorizontal: 32, alignItems: 'center' },
  logo: { height: 22, marginBottom: 12 },
  title: { color: '#ffffff', fontSize: 20, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 8, textAlign: 'center' },
  body: { padding: 32, paddingTop: 28 },
  resumen: { lineHeight: 1.5, marginBottom: 22 },
  sectionTitle: { color: BRAND, fontSize: 10, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  bulletRow: { flexDirection: 'row', marginBottom: 5, alignItems: 'flex-start' },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: BRAND, marginTop: 5, marginRight: 8 },
  bulletText: { flex: 1, lineHeight: 1.4 },
  section: { marginBottom: 20 },
  boxesRow: { flexDirection: 'row', gap: 12, marginTop: 6 },
  box: { flex: 1, backgroundColor: BRAND_LT, borderRadius: 8, padding: 14 },
  boxLabel: { color: BRAND, fontSize: 9, marginBottom: 4 },
  boxValueSm: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  boxValueLg: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  footer: { marginTop: 28, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9', textAlign: 'center', color: '#94a3b8', fontSize: 8 },
})

function formatMonto(monto: number | null, moneda: 'USD' | 'ARS') {
  if (monto == null) return '—'
  const formatted = new Intl.NumberFormat(moneda === 'ARS' ? 'es-AR' : 'en-US', { maximumFractionDigits: 0 }).format(monto)
  return `${moneda} ${formatted}`
}

interface Props {
  contenido: PropuestaContenido
  moneda: 'USD' | 'ARS'
  monto: number | null
  leadNombre?: string
  leadEmpresa?: string | null
}

function PropuestaPdf({ contenido, moneda, monto, leadNombre, leadEmpresa }: Props) {
  const preparadoPara = [leadNombre, leadEmpresa].filter(Boolean).join(' — ')
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src="https://globalalora.com/logo-web.png" style={styles.logo} />
          <Text style={styles.title}>{contenido.titulo}</Text>
          {preparadoPara && <Text style={styles.subtitle}>Preparado para {preparadoPara}</Text>}
        </View>

        <View style={styles.body}>
          <Text style={styles.resumen}>{contenido.resumen}</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Alcance</Text>
            {contenido.alcance.map((item, i) => (
              <View key={i} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Entregables</Text>
            {contenido.entregables.map((item, i) => (
              <View key={i} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.boxesRow}>
            <View style={styles.box}>
              <Text style={styles.boxLabel}>Cronograma estimado</Text>
              <Text style={styles.boxValueSm}>{contenido.cronograma}</Text>
            </View>
            <View style={styles.box}>
              <Text style={styles.boxLabel}>Inversión estimada</Text>
              <Text style={styles.boxValueLg}>{formatMonto(monto, moneda)}</Text>
            </View>
          </View>

          <Text style={styles.footer}>Alora — agencia de tecnología digital · globalalora.com</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderPropuestaPdf(props: Props): Promise<Buffer> {
  return renderToBuffer(<PropuestaPdf {...props} />)
}
