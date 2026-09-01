import fs from 'fs'
import path from 'path'
import { Document, Page, View, Text, Link, StyleSheet, renderToBuffer, Font } from '@react-pdf/renderer'

// react-pdf's exported Text style prop type resolves to an ambiguous union
// (plain vs SVG text) that TS can't narrow through a generic wrapper —
// this internal helper only ever receives real StyleSheet objects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TextStyleProp = any
import type { PropuestaContenido, PropuestaResumenEjecutivo } from '@/types'
import { BRAND } from './alora-brand'
import { splitBoldSegments } from './propuesta-format'
import { propuestaCtaLinks } from './propuesta-cta'

// Mismas fuentes que la versión web (Inter + un monospace para los headers
// numerados/badges, donde la web usa la pila de monospace del sistema) --
// registradas desde archivos locales (@fontsource, copiados a este repo) en
// vez de una URL remota, para no depender de una red externa en cada render.
//
// IMPORTANTE: estos .woff se leen por fs en runtime, no por import -- Vercel
// no los va a incluir en el bundle de la function a menos que estén en
// outputFileTracingIncludes (next.config.ts). Si el PDF pierde las fuentes
// en producción pero anda bien en local, empezá por ahí. Verificamos que el
// archivo exista antes de registrar para no romper el render entero por una
// fuente faltante -- en ese caso cae al Helvetica default de react-pdf.
const FONT_DIR = path.join(process.cwd(), 'src/lib/pdf-fonts')
const fontPath = (filename: string) => path.join(FONT_DIR, filename)
const fontsAvailable = fs.existsSync(fontPath('inter-latin-400-normal.woff'))

if (fontsAvailable) {
  Font.register({
    family: 'Inter',
    fonts: [
      { src: fontPath('inter-latin-400-normal.woff'), fontWeight: 400 },
      { src: fontPath('inter-latin-500-normal.woff'), fontWeight: 500 },
      { src: fontPath('inter-latin-600-normal.woff'), fontWeight: 600 },
      { src: fontPath('inter-latin-700-normal.woff'), fontWeight: 700 },
      { src: fontPath('inter-latin-800-normal.woff'), fontWeight: 800 },
    ],
  })

  Font.register({
    family: 'Mono',
    fonts: [
      { src: fontPath('jetbrains-mono-latin-400-normal.woff'), fontWeight: 400 },
      { src: fontPath('jetbrains-mono-latin-700-normal.woff'), fontWeight: 700 },
      { src: fontPath('jetbrains-mono-latin-800-normal.woff'), fontWeight: 800 },
    ],
  })
}

const BODY_FONT = fontsAvailable ? 'Inter' : 'Helvetica'
const MONO_FONT = fontsAvailable ? 'Mono' : 'Helvetica'

// La web nunca hifena (simplemente envuelve o desborda) -- sin esto react-pdf
// corta palabras largas con guión, que se ve distinto a la versión web.
Font.registerHyphenationCallback((word) => [word])

// IMPORTANT: wrap={false} only goes on small atomic units (a single bullet
// row, one subsección card) — never on a whole "bloque" section. Forcing an
// entire large section to stay together pushes it whole onto the next page
// the moment it does not fit the remaining space, leaving a big blank gap
// on the page before it. That is what blew this document out to 8 pages
// with empty voids — confirmed from a real render.
const styles = StyleSheet.create({
  // El padding tiene que vivir en el propio <Page>, no en un <View> interno
  // -- react-pdf decide DÓNDE cortar cada página según la caja del Page,
  // no según el padding de un View hijo (ese padding solo afecta el final
  // del documento entero, no cada salto). Confirmado con coordenadas reales:
  // con el padding en el View interno, el texto seguía renderizando hasta
  // ~816pt en una página de 842pt, pisando el footer (que arranca ~803pt).
  // paddingBottom tiene que ser mayor que el alto real del footer fijo (~38:
  // borde + paddingTop 8 + línea de texto).
  page: { fontSize: 10, fontFamily: BODY_FONT, color: '#2A2E34', backgroundColor: '#ffffff', paddingTop: 46, paddingLeft: 38, paddingRight: 38, paddingBottom: 58 },
  content: {},

  cover: { backgroundColor: BRAND.ink, borderRadius: 20, padding: 28, paddingBottom: 24, marginBottom: 24 },
  coverWordmark: { color: '#ffffff', fontSize: 16, fontFamily: BODY_FONT, fontWeight: 800, letterSpacing: 4, marginBottom: 16 },
  coverBadgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  coverDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.turquesa, marginRight: 6 },
  coverBadge: { color: '#C9CED6', fontSize: 8, fontFamily: MONO_FONT, letterSpacing: 1.4, textTransform: 'uppercase' },
  coverTitle: { color: '#ffffff', fontSize: 22, fontFamily: BODY_FONT, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.4, marginBottom: 14 },
  coverClientBox: { backgroundColor: '#12161B', borderWidth: 1, borderColor: '#22282F', borderRadius: 12, padding: 12, alignSelf: 'flex-start' },
  coverClientLabel: { color: BRAND.turquesa, fontSize: 8, fontFamily: MONO_FONT, letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 5 },
  coverClientName: { color: '#ffffff', fontSize: 11, fontFamily: BODY_FONT, fontWeight: 600 },
  coverSubtitlePlain: { color: 'rgba(255,255,255,0.7)', fontSize: 10.5, marginTop: 4 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 4 },
  sectionN: { fontSize: 10.5, color: BRAND.turquesa, marginRight: 8, fontFamily: MONO_FONT, fontWeight: 700 },
  sectionLine: { width: 20, height: 1, backgroundColor: BRAND.border, marginRight: 8 },
  sectionLabel: { fontSize: 10.5, fontFamily: MONO_FONT, fontWeight: 700, letterSpacing: 1.3, textTransform: 'uppercase', color: BRAND.ink },

  block: { marginBottom: 20 },
  parrafo: { lineHeight: 1.7, marginBottom: 8, fontSize: 10 },

  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, paddingRight: 8 },
  bulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: BRAND.turquesa, marginTop: 4.5, marginRight: 8 },
  bulletDotMuted: { width: 3.5, height: 3.5, borderRadius: 1.75, backgroundColor: BRAND.textMuted, marginTop: 5, marginRight: 8 },
  bulletText: { flex: 1, fontSize: 10, lineHeight: 1.55 },

  subCard: { backgroundColor: BRAND.surface, borderRadius: 14, padding: 13, marginBottom: 10 },
  subTitle: { fontSize: 10.5, fontFamily: BODY_FONT, fontWeight: 700, color: BRAND.ink, marginBottom: 7 },

  invCard: { backgroundColor: BRAND.ink, borderRadius: 16, padding: 20 },
  invPaquete: { color: BRAND.turquesa, fontSize: 8.5, fontFamily: MONO_FONT, letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 8 },
  invMonto: { fontSize: 26, fontFamily: BODY_FONT, fontWeight: 800, color: '#ffffff', marginBottom: 10 },
  invFormaPago: { fontSize: 9, color: '#B7BDC6', lineHeight: 1.5 },

  mantCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: BRAND.border, borderRadius: 16, padding: 18 },
  mantMonto: { fontSize: 17, fontFamily: BODY_FONT, fontWeight: 800, color: BRAND.ink, marginBottom: 10 },

  footer: { position: 'absolute', bottom: 26, left: 38, right: 38, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: BRAND.border, paddingTop: 8, fontFamily: MONO_FONT },
  footerWordmark: { fontSize: 7.5, fontFamily: MONO_FONT, fontWeight: 800, letterSpacing: 1.5, color: BRAND.ink },
  footerText: { fontSize: 7, fontFamily: MONO_FONT, color: BRAND.textMuted },

  label: { fontSize: 10.5, fontFamily: MONO_FONT, fontWeight: 700, letterSpacing: 1.3, textTransform: 'uppercase', color: BRAND.ink, marginBottom: 9 },
  twoCol: { flexDirection: 'row', gap: 20 },
  col: { flex: 1 },
  resumenInvCard: { backgroundColor: BRAND.ink, borderRadius: 16, padding: 20, flexDirection: 'row', gap: 24 },

  ctaSection: { marginTop: 28, alignItems: 'center' },
  ctaPrimary: { width: '100%', textAlign: 'center', backgroundColor: BRAND.turquesa, color: '#ffffff', fontSize: 10.5, fontFamily: BODY_FONT, fontWeight: 600, borderRadius: 10, paddingVertical: 11, marginBottom: 8, textDecoration: 'none' },
  ctaSecondary: { width: '100%', textAlign: 'center', borderWidth: 1, borderColor: BRAND.border, color: '#2A2E34', fontSize: 10.5, fontFamily: BODY_FONT, fontWeight: 500, borderRadius: 10, paddingVertical: 11, marginBottom: 10, textDecoration: 'none' },
  ctaLink: { fontSize: 8.5, fontFamily: MONO_FONT, color: BRAND.textMuted, textDecoration: 'underline' },
})

function formatMonto(monto: number, moneda: 'USD' | 'ARS') {
  const formatted = new Intl.NumberFormat(moneda === 'ARS' ? 'es-AR' : 'en-US', { maximumFractionDigits: 0 }).format(monto)
  return `${moneda} ${formatted}`
}

// El subset "latin" de Inter/JetBrains Mono (el que trae @fontsource) no
// incluye flechas -- el agente las usa en "Modalidad de trabajo" y
// "Modelo de funcionamiento" ("Relevamiento → Branding → ..."), y sin esto
// se ven como un glifo roto (tofu / comilla suelta) en vez de una flecha.
// La web no tiene este problema (usa la fuente del sistema, que sí las
// tiene), así que el reemplazo es solo acá.
function sanitizeForPdf(text: string): string {
  return text.replace(/→/g, '->').replace(/←/g, '<-').replace(/↔/g, '<->')
}

// La web marca **negrita** con font-semibold (600) sobre Inter, no un bold
// pleno -- usar el mismo peso acá para que el énfasis se vea igual.
function BoldText({ text, style, boldColor }: { text: string; style?: TextStyleProp; boldColor?: string }) {
  return (
    <Text style={style}>
      {splitBoldSegments(sanitizeForPdf(text)).map((seg, i) =>
        seg.bold
          ? <Text key={i} style={{ fontFamily: BODY_FONT, fontWeight: 600, color: boldColor }}>{seg.text}</Text>
          : <Text key={i}>{seg.text}</Text>
      )}
    </Text>
  )
}

function SectionHeader({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.sectionHeaderRow} wrap={false}>
      <Text style={styles.sectionN}>{String(n).padStart(2, '0')}</Text>
      <View style={styles.sectionLine} />
      <Text style={styles.sectionLabel}>{label}</Text>
    </View>
  )
}

function BulletRow({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <View style={styles.bulletRow} wrap={false}>
      <View style={muted ? styles.bulletDotMuted : styles.bulletDot} />
      <BoldText text={text} style={[styles.bulletText, muted ? { color: BRAND.textMuted } : {}]} boldColor={BRAND.ink} />
    </View>
  )
}

// Mismos tres botones que la página pública (Aceptar / Tengo dudas /
// contacto directo) -- un PDF no ejecuta JS, así que van como links reales
// a WhatsApp (Link de react-pdf), no como botones interactivos.
function CtaSection({ titulo }: { titulo: string }) {
  const links = propuestaCtaLinks(titulo)
  return (
    <View style={styles.ctaSection} wrap={false}>
      <Link src={links.aceptar} style={styles.ctaPrimary}>
        <Text>Aceptar propuesta y comenzar ahora — 15% off</Text>
      </Link>
      <Link src={links.dudas} style={styles.ctaSecondary}>
        <Text>Tengo dudas sobre la propuesta</Text>
      </Link>
      <Link src={links.contacto} style={styles.ctaLink}>
        <Text>Escribinos directo por WhatsApp</Text>
      </Link>
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

  // Mismo criterio que el render web: el cierre va al final del documento,
  // después de inversión y mantenimiento, no en el medio.
  const cierreIdx = bloques.findIndex((b) => b.id === 'cierre')
  const mainBloques = cierreIdx >= 0 ? bloques.filter((_, i) => i !== cierreIdx) : bloques
  const cierreBloque = cierreIdx >= 0 ? bloques[cierreIdx] : null

  function renderBloque(bloque: PropuestaContenido['bloques'][number], num: number) {
    // "Pegar" el header a su primer párrafo/item como unidad atómica se
    // probó (dos veces) y en la práctica sigue generando huecos grandes --
    // ese primer chunk puede ser largo, y wrap={false} lo obliga a saltar
    // ENTERO si no entra. minPresenceAhead es la herramienta correcta de
    // react-pdf para esto: reserva un colchón chico y fijo (no depende del
    // contenido) antes del header, así el peor caso de hueco queda acotado
    // en vez de variar según cuánto mida el primer párrafo.
    return (
      <View key={bloque.id} style={styles.block}>
        <View minPresenceAhead={70}>
          <SectionHeader n={num} label={bloque.titulo} />
        </View>

        {bloque.parrafos?.map((p, i) => (
          <BoldText key={i} text={p} style={styles.parrafo} boldColor={BRAND.ink} />
        ))}

        {bloque.items?.map((item, i) => <BulletRow key={i} text={item} />)}

        {bloque.subsecciones?.map((sub, i) => (
          <View key={i} style={styles.subCard} wrap={false}>
            <Text style={styles.subTitle}>{sub.titulo}</Text>
            {sub.items.map((item, j) => <BulletRow key={j} text={item} muted />)}
          </View>
        ))}
      </View>
    )
  }

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

          {mainBloques.map((bloque) => renderBloque(bloque, ++n))}

          <View style={styles.block} wrap={false}>
            <SectionHeader n={++n} label="Inversión" />
            <View style={styles.invCard}>
              <Text style={styles.invPaquete}>{inversion.paquete}</Text>
              <Text style={styles.invMonto}>{formatMonto(inversion.monto, inversion.moneda)}</Text>
              <BoldText text={inversion.forma_pago} style={styles.invFormaPago} boldColor="#ffffff" />
            </View>
          </View>

          {mantenimiento && (
            <View style={styles.block} wrap={false}>
              <SectionHeader n={++n} label="Mantenimiento (opcional)" />
              <View style={styles.mantCard}>
                <Text style={styles.mantMonto}>{formatMonto(mantenimiento.monto_mensual, mantenimiento.moneda)} <Text style={{ fontSize: 10, fontFamily: BODY_FONT, fontWeight: 400, color: BRAND.textMuted }}>/ mes</Text></Text>
                {mantenimiento.incluye.map((item, i) => <BulletRow key={i} text={item} />)}
              </View>
            </View>
          )}

          {cierreBloque && renderBloque(cierreBloque, ++n)}

          <CtaSection titulo={titulo} />
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

          <View style={styles.block}>
            <Text style={styles.label}>Lo que encontramos</Text>
            {hallazgos.map((h, i) => <BulletRow key={i} text={h} />)}
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>Lo que proponemos</Text>
            <BoldText text={propuesta} style={styles.parrafo} boldColor={BRAND.ink} />
          </View>

          <View style={[styles.twoCol, styles.block]}>
            <View style={styles.col}>
              <Text style={styles.label}>Incluye</Text>
              {incluye.map((item, i) => <BulletRow key={i} text={item} />)}
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>No incluye</Text>
              {no_incluye.map((item, i) => <BulletRow key={i} text={item} muted />)}
            </View>
          </View>

          <View style={styles.resumenInvCard} wrap={false}>
            <View style={styles.col}>
              <Text style={[styles.invPaquete, { marginBottom: 6 }]}>Inversión — {inversion.paquete}</Text>
              <Text style={[styles.invMonto, { fontSize: 22, marginBottom: 6 }]}>{formatMonto(inversion.monto, inversion.moneda)}</Text>
              <BoldText text={inversion.forma_pago} style={styles.invFormaPago} boldColor="#ffffff" />
            </View>
            <View style={styles.col}>
              <Text style={[styles.invPaquete, { color: BRAND.electric, marginBottom: 6 }]}>Tiempos</Text>
              <Text style={{ color: '#ffffff', fontSize: 12, fontFamily: BODY_FONT, fontWeight: 600 }}>{tiempos}</Text>
            </View>
          </View>

          <CtaSection titulo={titulo} />
        </View>

        <Footer />
      </Page>
    </Document>
  )
}

export async function renderResumenPdf(contenido: PropuestaResumenEjecutivo): Promise<Buffer> {
  return renderToBuffer(<PropuestaResumenPdf {...contenido} />)
}
