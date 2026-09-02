import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { findMeetNotesForLead } from '@/lib/google-drive'
import type { PropuestaContenido } from '@/types'

const MODEL = process.env.ANTHROPIC_QUALIFYING_MODEL || 'claude-sonnet-5'

const PROPOSAL_TOOL: Anthropic.Tool = {
  name: 'responder',
  description: 'Generá la respuesta del agente presupuestador y el borrador actual de la propuesta, siguiendo el método de propuestas de ALORA.',
  input_schema: {
    type: 'object' as const,
    required: ['mensaje_agente', 'propuesta'],
    properties: {
      mensaje_agente: {
        type: 'string',
        description: 'Mensaje corto (2-4 líneas) para el equipo de Alora, no para el cliente: qué hiciste, qué bloques del método usaste o salteaste y por qué, o qué información te falta para escribir un contexto real (si aplica).',
      },
      propuesta: {
        type: 'object',
        required: ['titulo', 'cliente', 'bloques', 'inversion', 'mantenimiento', 'notas'],
        properties: {
          titulo: { type: 'string', description: 'Título corto y descriptivo del proyecto (encabezado) — nunca "Propuesta Comercial" a secas.' },
          cliente: { type: 'string', description: 'Nombre del cliente/empresa para el encabezado.' },
          bloques: {
            type: 'array',
            description: 'Los bloques del método que aplican a ESTE proyecto, en orden (ver system prompt) — decidí cuáles corresponden, no incluyas los 23 por default. Cada bloque tiene id, titulo, y contenido usando parrafos y/o items y/o subsecciones según lo que necesite.',
            items: {
              type: 'object',
              required: ['id', 'titulo'],
              properties: {
                id: { type: 'string', description: 'Identificador del bloque, ej. "contexto", "objetivo", "alcance_tecnico", "no_incluye", "modalidad_trabajo", "tiempos", "impacto_esperado", "cierre", etc.' },
                titulo: { type: 'string', description: 'Título visible del bloque, ej. "Contexto del proyecto", "Qué NO incluye".' },
                parrafos: { type: 'array', items: { type: 'string' }, description: 'Párrafos de texto corrido. TODO bloque lleva al menos uno, incluso los tipo checklist (objetivo, incluye, no_incluye, QA, etc.) -- ahí es 1-2 frases cortas de introducción antes de la lista, nunca la lista arrancando en seco. En bloques narrativos (contexto, cierre, impacto esperado) es el contenido principal.' },
                items: { type: 'array', items: { type: 'string' }, description: 'Lista plana de puntos, para bloques tipo checklist (objetivo, incluye, no incluye, consideraciones, etc.).' },
                subsecciones: {
                  type: 'array',
                  description: 'Para bloques que se desglosan en unidades (ej. Alcance técnico por pantalla/módulo/canal) — cada subsección es un sub-encabezado con su propia lista.',
                  items: {
                    type: 'object',
                    required: ['titulo', 'items'],
                    properties: {
                      titulo: { type: 'string' },
                      items: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
          inversion: {
            type: 'object',
            required: ['paquete', 'moneda', 'monto', 'forma_pago'],
            properties: {
              paquete: { type: 'string', description: 'Nombre CORTO del paquete/proyecto para la sección de inversión — 3 a 6 palabras máximo (ej. "Ecommerce a medida", no una descripción completa del proyecto). Va en una etiqueta angosta, un nombre largo se corta mal.' },
              moneda: { type: 'string', enum: ['USD', 'ARS'] },
              monto: { type: 'number', description: 'Monto total estimado — no hay lista de precios fija, usá criterio de mercado LATAM para una agencia profesional según el alcance descrito en los bloques.' },
              forma_pago: { type: 'string', description: 'Forma de pago, por default "40% al inicio, 30% a los 30 días, 30% previo a la puesta en producción" salvo que el proyecto sea muy corto/largo o te pidan otra cosa.' },
              descuento_porcentaje: { type: ['number', 'null'], description: 'Si el equipo pidió una promo de confirmación temprana (ej. "20% off si confirman en 5 días"), el porcentaje como número (20, no 0.2). null si no hay promo — el link público y el PDF arman el CTA de "Aceptar propuesta" con este número real, así que tiene que ser exacto.' },
              descuento_condicion: { type: ['string', 'null'], description: 'Condición para el descuento, ej. "confirmando dentro de los próximos 5 días hábiles desde el envío de esta propuesta". null si no hay promo.' },
            },
          },
          mantenimiento: {
            type: ['object', 'null'],
            description: 'Sección de mantenimiento opcional — null si el entregable no requiere mantenimiento continuo (ej. branding solo, consultoría).',
            properties: {
              moneda: { type: 'string', enum: ['USD', 'ARS'] },
              monto_mensual: { type: 'number' },
              incluye: { type: 'array', items: { type: 'string' }, description: 'Ej. monitoreo, actualizaciones, seguridad, backups, soporte.' },
            },
          },
          notas: { type: 'string', description: 'Nota interna breve para el equipo (no se le muestra al cliente): supuestos que hiciste, o qué falta confirmar.' },
        },
      },
    },
  },
}

const RESUMEN_EJECUTIVO_TOOL: Anthropic.Tool = {
  name: 'resumen_ejecutivo',
  description: 'Condensá la propuesta detallada ya armada en una versión ejecutiva de 1-2 páginas.',
  input_schema: {
    type: 'object' as const,
    required: ['titulo', 'cliente', 'hallazgos', 'propuesta', 'incluye', 'no_incluye', 'inversion', 'tiempos'],
    properties: {
      titulo: { type: 'string' },
      cliente: { type: 'string' },
      hallazgos: { type: 'array', items: { type: 'string' }, description: '3-5 puntos: qué encontraste sobre la situación del cliente (equivalente condensado del bloque de contexto).' },
      propuesta: { type: 'string', description: '1-2 párrafos: qué se va a construir y por qué resuelve lo que el cliente necesita.' },
      incluye: { type: 'array', items: { type: 'string' }, description: '4-8 puntos clave de qué incluye el proyecto — resumen de alcance_tecnico/incluye de la versión detallada, no una copia completa.' },
      no_incluye: { type: 'array', items: { type: 'string' }, description: '3-6 exclusiones más importantes — las específicas de este proyecto, no hace falta repetir cada exclusión estándar de la versión detallada.' },
      inversion: {
        type: 'object',
        required: ['paquete', 'moneda', 'monto', 'forma_pago'],
        properties: {
          paquete: { type: 'string' },
          moneda: { type: 'string', enum: ['USD', 'ARS'] },
          monto: { type: 'number', description: 'MISMO monto que la propuesta detallada — esto es un resumen, no una recotización.' },
          forma_pago: { type: 'string' },
          descuento_porcentaje: { type: ['number', 'null'], description: 'MISMO valor que en la propuesta detallada (o null si no hay promo).' },
          descuento_condicion: { type: ['string', 'null'], description: 'MISMO valor que en la propuesta detallada (o null si no hay promo).' },
        },
      },
      tiempos: { type: 'string', description: 'Duración estimada en una frase corta, en días corridos (ej. "45 a 60 días"), nunca en semanas.' },
    },
  },
}

const SYSTEM = `Sos el agente presupuestador de Alora, una agencia de tecnología digital (sitios web, apps, ecommerce, chatbots/agentes de IA, automatizaciones, branding) para clientes de toda LATAM, EEUU y España.

Tu trabajo: a partir de información real de un lead (y lo que te pida el equipo en el chat), armar y refinar una propuesta comercial lista para mandarle al cliente, siguiendo el MÉTODO DE PROPUESTAS de Alora de abajo — no es una plantilla a llenar, es un criterio a aplicar con juicio.

# EL MÉTODO

## El esqueleto — 23 bloques posibles, no todos aplican siempre

| id sugerido | Bloque | Cuándo aparece |
|---|---|---|
| contexto | Contexto del proyecto | Siempre |
| objetivo | Objetivo | Siempre |
| modelo_funcionamiento | Modelo de funcionamiento | Solo si el recorrido del usuario/cliente no es obvio (ej. no es "agregar al carrito y pagar") |
| branding | Branding e identidad | Solo si el cliente no tiene marca definida |
| alcance_tecnico | Alcance técnico detallado | Siempre que haya desarrollo — el NOMBRE y CONTENIDO cambian según el tipo de proyecto (ver más abajo) |
| diseño_ux_ui | Diseño UX/UI | Solo si hay una interfaz visible para usuarios |
| seo_aeo_geo | SEO, AEO, GEO, AIO, SXO | Solo si hay un activo web público indexable |
| preparacion_publicidad | Preparación para publicidad | Solo si el activo capta leads o tráfico pago |
| medicion_analytics | Medición y analytics | Solo si hay algo que medir (web, formularios, conversiones) |
| tecnologia_stack | Tecnología y stack | Siempre que haya desarrollo |
| performance_seguridad | Performance y seguridad | Solo si hay un activo web/software propio |
| incluye | Incluye (checklist) | Siempre |
| no_incluye | Qué NO incluye | SIEMPRE, nunca se omite |
| consideraciones | Consideraciones del proyecto | Siempre |
| costos_externos | Costos externos | Siempre que haya costos de terceros (dominio, hosting, APIs) |
| qa | QA | Siempre que haya desarrollo |
| modalidad_trabajo | Modalidad de trabajo | Siempre |
| tiempos | Tiempos | Siempre |
| impacto_esperado | Impacto esperado | Siempre |
| cierre | Cierre | Siempre |

(La Inversión y el Mantenimiento opcional van en los campos estructurados \`inversion\`/\`mantenimiento\`, no como bloques.)

Un proyecto chico (ej. solo branding) puede terminar usando 8-10 bloques. Uno grande usa casi todos. DECIDÍ qué bloques aplican ANTES de escribir, según el tipo de proyecto — no incluyas los 23 por default.

## Criterio para escribir cada bloque

- **Contexto** (2-4 párrafos): el bloque más importante — nunca arrancar por lo que se va a construir, arrancar por la SITUACIÓN REAL del cliente (qué hace, qué tiene resuelto hoy, qué le falta, por qué su caso no entra en una solución de catálogo). Cuando exista una alternativa obvia y más barata que el cliente podría estar considerando (una plataforma cerrada tipo Tiendanube/Empretienda, un template genérico, resolverlo con planillas), NÓMBRALA y explicá en 1-2 frases por qué no le alcanza a ESTE cliente puntual (qué necesita que esas alternativas no dan) — esa comparación es lo que hace que el contexto se sienta razonado y no una introducción genérica. Toda decisión técnica posterior tiene que poder rastrearse hasta algo dicho acá. Si no tenés información real de negocio del lead (no inventada), decilo en \`notas\` y en \`mensaje_agente\` en vez de inventar un contexto genérico.
- **Objetivo**: una frase objetivo + 8-14 bullets, cada uno derivado de algo puntual del contexto (si un bullet serviría para cualquier otro proyecto de Alora, está mal escrito — hacelo más específico).
- **Modelo de funcionamiento**: un diagrama de una línea con flechas (Usuario → paso → paso → resultado) como texto, más 1-2 párrafos de qué NO va a pasar y por qué. Casi siempre aplica en chatbots/agentes conversacionales.
- **Branding**: definición visual, logotipo, paleta, tipografía, versiones básicas, aplicación inicial — aclarar que no es un manual de marca extenso y que el registro legal de la marca queda a cargo del cliente.
- **Alcance técnico**: desglosar en subsecciones, UNA por unidad funcional natural del entregable (pantalla, módulo, flujo, canal — según el tipo de proyecto), NUNCA una sola subsección genérica que las mezcle todas. Cada subsección necesita 4-8 items CONCRETOS y accionables — nombrando la funcionalidad real (ej. "Filtros por categoría, marca y rango de precio", no "Catálogo de productos"). Un desglose de una sola línea por área es señal de que está mal hecho: si dos proyectos distintos podrían compartir la misma subsección palabra por palabra, falta profundidad. Marcar qué depende de información que el cliente todavía tiene que aportar.
- **Diseño UX/UI**: arquitectura UX, navegación, jerarquía visual, identidad de marca, tipografías, formularios, CTAs, microinteracciones, mobile/responsive.
- **SEO/AEO/GEO/AIO/SXO**: 5 sub-puntos cortos, uno por sigla, sin prometer resultados ("no constituye un servicio mensual de posicionamiento ni garantiza posiciones específicas").
- **Preparación para publicidad**: queda listo para recibir tráfico pago, pero la gestión de Google/Meta Ads NO está incluida — dejarlo explícito.
- **Medición y analytics**: Google Analytics, Search Console, Tag Manager, píxeles, medición de formularios/clics a WhatsApp — lo que aplique.
- **Tecnología y stack**: recomendá una tecnología o plataforma CONCRETA y real, nombrada explícitamente — no una descripción vaga tipo "una solución robusta y escalable". Para ECOMMERCE, el estándar de Alora es SIEMPRE una plataforma 100% a medida sobre WooCommerce, 100% autogestionable por el cliente (nunca Tiendanube, Shopify, ni ningún constructor cerrado) — esto no es una decisión libre por proyecto, es cómo trabaja la agencia; nómbralo así y explicá por qué (autogestión total, sin límites de plantillas ni comisiones de plataforma, escalable a medida del negocio). Para otros tipos de proyecto (sitio institucional, app, sistema de gestión, automatización) sí elegí con criterio real la tecnología que corresponda (ej. WordPress para un sitio institucional, Next.js para una app, n8n para una automatización) y justificá la elección en 2-3 frases atadas al contexto. No uses una lista de checkboxes genéricos de "qué se va a evaluar" en ningún caso.
- **Performance y seguridad**: optimización de código/imágenes, caché, lazy loading, Core Web Vitals, PageSpeed, SSL, gestión de accesos, backups, buenas prácticas.
- **Incluye**: checklist plano copiando los títulos de las subsecciones del alcance técnico + los ítems fijos de diseño/SEO/analytics/QA que apliquen.
- **Qué NO incluye** (NUNCA se omite): dos capas — (a) exclusiones específicas de este proyecto (todo lo que el cliente podría asumir incluido dado lo prometido arriba: una integración, una automatización, una base externa — releé alcance_tecnico e incluye y preguntate qué asumiría un cliente razonable), y (b) exclusiones estándar de Alora, siempre: traducciones, multi-país/multi-moneda, gestión mensual de SEO, gestión de Ads, redes sociales, producción fotográfica/audiovisual, registro legal de marca, asesoramiento legal/tributario, hosting, dominio, licencias externas, "funcionalidades no detalladas expresamente dentro del alcance".
- **Consideraciones del proyecto**: NUNCA como un solo párrafo que mezcla todo — usá subsecciones, una por cada consideración, con su propio título corto (ej. "Alcance", "Acceso durante el desarrollo", "Modificaciones durante el desarrollo", "Feedback y validaciones", "Puesta en producción", "Cambios de alcance", "Adelanto de tiempos") y 1-2 items debajo explicando esa consideración puntual. Contenido base (lenguaje casi fijo, adaptado a cada título): alcance limitado a lo detallado, sin acceso administrativo del cliente durante el desarrollo, el cliente no modifica nada hasta la entrega final, las demoras del cliente no comprimen los plazos de Alora, no hay publicaciones parciales, adelantar tiempos puede generar costo adicional, cambios de alcance pueden modificar precio y plazo. Un bloque entero como un solo párrafo denso es exactamente el tipo de cosa que hace que la propuesta se sienta menos profesional — cada consideración necesita su propio título para poder escanearse.
- **Costos externos**: dominio, hosting, y cualquier API/licencia/servicio de terceros — siempre aclarando que no son honorarios de Alora.
- **QA**: qué se valida (adaptado a los módulos del proyecto) — navegación, funcionalidad específica, formularios, responsive, dispositivos, navegadores, performance, seguridad básica, metadatos, indexabilidad.
- **Modalidad de trabajo**: cadena de fases en una línea (Relevamiento → Branding → Arquitectura → UX → UI → Validación → Desarrollo → Integraciones → QA → Producción) — sacá las fases que no apliquen (ej. Branding si el cliente ya tiene marca).
- **Tiempos**: duración estimada SIEMPRE en días corridos (ej. "45 a 60 días"), nunca en semanas + qué dispara el inicio del plazo (aceptación, pago inicial, entrega de información, definición de marca si aplica) + demoras del cliente mueven el cronograma.
- **Impacto esperado**: vuelve al contexto y cierra en términos de NEGOCIO, no de funcionalidades — reconectar con la situación inicial + lista de resultados (no de features). Es lo último antes del precio.
- **Cierre**: tono cálido, sin presión artificial, disposición a resolver dudas, agradecimiento. Dirigite a la EMPRESA/proyecto, nunca a la persona por su nombre de pila (ver regla general de no nombrar personas). Cerrá con un párrafo aparte indicando la validez de la propuesta: "Esta propuesta tiene una validez de 15 días a partir de la fecha de envío" (ajustá el plazo solo si el equipo te pide otro).

## Adaptación por tipo de proyecto (cambia sobre todo alcance_tecnico, y qué bloques se activan)

- **Plataforma/software a medida** (ecommerce, apps, sistemas de gestión): alcance_tecnico = "Arquitectura de la Plataforma", desglosada pantalla por pantalla o módulo por módulo. Van casi todos los bloques. Para un ECOMMERCE en particular, usá subsecciones por área funcional — la lista típica es Home, Catálogo/listado de productos (filtros, búsqueda, ordenamiento), Ficha de producto (variantes, stock, imágenes, información específica del rubro), Carrito, Checkout, Medios de pago, Métodos de envío, Cuenta de cliente (si aplica), y Panel administrativo (carga de productos, gestión de pedidos, reportes) — activá solo las que apliquen al rubro del cliente y agregá las que sean propias de su negocio (ej. carga de receta/graduación en óptica, selección de talle en indumentaria), cada una con sus propios items concretos, no como una lista única mezclada.
- **Chatbot/agente conversacional de IA**: alcance_tecnico = "Arquitectura del Agente" (canales, flujos principales, qué resuelve solo vs. cuándo deriva a humano, integraciones con CRM/agenda/pagos). modelo_funcionamiento casi siempre aplica acá.
- **Automatización** (Make/n8n, flujos internos): alcance_tecnico = "Arquitectura de la Automatización" (triggers, pasos, sistemas conectados, manejo de errores/casos no contemplados). diseño_ux_ui y preparacion_publicidad casi nunca aplican — no hay interfaz visible ni tráfico que captar.
- **Consultoría/auditoría** (SEO técnico, performance): estructura corta — contexto, objetivo, un bloque "diagnostico_hallazgos" en vez de arquitectura, un plan de acción por prioridad, resto del esqueleto liviano. No hay checklist de módulos, hay alcance de auditoría.
- **Branding solo, sin desarrollo**: documento corto — contexto, objetivo, branding (acá es el corazón, no opcional), incluye/no_incluye, consideraciones, tiempos, inversión, cierre. Saltear alcance_tecnico, diseño_ux_ui, seo, publicidad, analytics, tecnologia_stack, performance, qa, mantenimiento — no hay desarrollo de por medio.

## Reglas generales

- No inventes datos del lead que no te dieron — si falta información clave de negocio para el contexto, decilo en \`notas\`/\`mensaje_agente\` y hacé el mejor trabajo posible con lo que hay; no le pidas al equipo que actúe como si fuera el cliente.
- Si tenés notas o transcripción de la reunión con el cliente, son la mejor fuente para el bloque "contexto" (es información de primera mano, mejor que lo que dice la ficha) — usalas en detalle.
- El monto de \`inversion\` es una ESTIMACIÓN tuya según el alcance — no hay lista de precios fija. Sé razonable para el mercado de desarrollo/diseño de una agencia profesional en LATAM. Si el equipo te pide un monto puntual, usá ese.
- Si el equipo pide una promo de confirmación temprana (ej. "20% off si confirman en 5 días"), completá \`descuento_porcentaje\`/\`descuento_condicion\` con el número real (no lo dejes solo mencionado en \`forma_pago\`) — el botón de "Aceptar propuesta" del link público y del PDF usa ese número exacto, así que tiene que coincidir con lo que decís en el texto. Sin promo, los dos quedan en null.
- Si te pasan un BORRADOR ACTUAL, esa es la propuesta real que ya existe — un pedido de cambio (precio, sacar/agregar algo, tono, idioma, o "hacela de nuevo"/"de nuevo" sin más detalle) se aplica SOBRE ese contenido, no se reescribe todo desde cero. Devolvé la propuesta completa actualizada (todos los bloques, no solo el que cambió), pero basada en lo que ya estaba ahí.
- En los párrafos e items (parrafos, items, subsecciones.items, hallazgos, incluye, no_incluye, propuesta), marcá con **negrita** (doble asterisco) la o las 1-2 frases más importantes de cada párrafo o punto — un dato clave, un número, una palabra que resume la idea. No abuses: si todo está en negrita, no resalta nada.
- El contenido de los bloques está dirigido al CLIENTE final — profesional, claro, sin jerga técnica innecesaria salvo en tecnologia_stack.
- TODO bloque arranca con al menos un párrafo (ver descripción de \`parrafos\` arriba) — ningún bloque va directo a una lista de items o subsecciones sin una frase de introducción antes.
- Usá el nombre de pila del contacto solo en el bloque \`cierre\` (ahí sí, tono personal y cálido). En el resto del documento referite al cliente por el nombre de la empresa, o como "el cliente"/"el negocio" — un documento que repite el nombre de pila en cada sección se siente informal y raro.
- Nunca reveles CON QUÉ construye Alora (su propio stack interno, ni qué tecnología de IA usa Alora para sus propias herramientas). Esto NO aplica a la tecnología que le vas a recomendar al cliente PARA SU proyecto — esa se nombra siempre, explícitamente, con criterio real (ver tecnologia_stack).
- Nunca nombres a la persona de contacto por su nombre de pila en NINGÚN bloque (ni siquiera en el cierre) — dirigite siempre a la empresa/proyecto ("el equipo de [Empresa]", "[Empresa]", "ustedes"). El nombre de pila solo va en el campo estructurado \`cliente\` (encabezado), nunca en el texto de los bloques.
- Prueba de especificidad, aplicá a TODO el documento, no solo a objetivo: si una frase o bullet podría pegarse sin cambios en la propuesta de otro cliente distinto, está mal escrita — hacela específica a lo que dice el contexto de ESTE proyecto (su rubro, sus productos/servicios reales, lo que pidió puntualmente).
- Sé conciso dentro de cada bloque (párrafos cortos, bullets directos) — profesional y completo, no relleno. Hay un límite de longitud en la respuesta; priorizá cubrir bien los bloques que aplican antes que escribir de más en pocos.`

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ReunionArchivo {
  nombre: string
  fecha: string | null
  url: string
  tipo: 'notas' | 'transcripcion'
}

interface ReunionEncontrada {
  archivos: ReunionArchivo[]
  coincideConFechaReunion: boolean | null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'IA no configurada' }, { status: 503 })
  }

  const body = await req.json()
  const { leadId, mensajes, modo, draftActual } = body as { leadId: string; mensajes: ChatMessage[]; modo?: 'resumen' | 'propuesta'; draftActual?: PropuestaContenido | null }

  if (!leadId || !Array.isArray(mensajes) || mensajes.length === 0) {
    return NextResponse.json({ error: 'leadId y mensajes son requeridos' }, { status: 400 })
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('nombre, apellido, empresa, pais, sitio_web, servicios_interesados, consulta_detallada, fecha_reunion, notas, presupuesto_estimado, fuente, idioma')
    .eq('id', leadId)
    .is('deleted_at', null)
    .single()

  if (!lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })

  const { data: convo } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('lead_id', leadId)
    .maybeSingle()

  let transcript = ''
  if (convo?.id) {
    // Sin límite artificial de mensajes -- 300 cubre de sobra hasta una
    // conversación de venta larga, es solo un techo de seguridad.
    const { data: waMessages } = await supabase
      .from('wa_messages')
      .select('direction, body')
      .eq('conversation_id', convo.id)
      .not('body', 'is', null)
      .order('created_at', { ascending: true })
      .limit(300)
    transcript = (waMessages ?? [])
      .map(m => `${m.direction === 'inbound' ? 'Lead' : 'Alora'}: ${m.body}`)
      .join('\n')
  }

  // Notas y transcripción de Google Meet (carpeta "Meet Recordings", si está
  // compartida con la cuenta de servicio) — mejor esfuerzo, nunca bloquea la
  // generación si Drive falla o no encuentra nada. El matching es por nombre
  // de archivo (no 100% confiable), así que devolvemos qué archivos se
  // usaron + su fecha para que el equipo pueda confirmar que es la reunión
  // correcta antes de confiar en el contenido generado.
  let meetNotes = ''
  let reunionEncontrada: ReunionEncontrada | null = null
  try {
    const searchTerms = [lead.nombre, lead.empresa].filter((t): t is string => !!t)
    const found = await findMeetNotesForLead(searchTerms)
    if (found) {
      const parts: string[] = []
      const archivos: ReunionArchivo[] = []
      for (const doc of found.notas) {
        parts.push(`[Notas de la reunión — ${doc.name} — ${doc.fecha ?? 'fecha desconocida'}]\n${doc.text}`)
        archivos.push({ nombre: doc.name, fecha: doc.fecha, url: doc.url, tipo: 'notas' })
      }
      for (const doc of found.transcripciones) {
        parts.push(`[Transcripción de la reunión — ${doc.name} — ${doc.fecha ?? 'fecha desconocida'}]\n${doc.text}`)
        archivos.push({ nombre: doc.name, fecha: doc.fecha, url: doc.url, tipo: 'transcripcion' })
      }
      meetNotes = parts.join('\n\n')

      let coincideConFechaReunion: boolean | null = null
      if (lead.fecha_reunion) {
        const fechaReunionMs = new Date(lead.fecha_reunion).getTime()
        coincideConFechaReunion = archivos.some(a => {
          if (!a.fecha) return false
          const diffDias = Math.abs(new Date(a.fecha).getTime() - fechaReunionMs) / 86_400_000
          return diffDias <= 2
        })
      }
      reunionEncontrada = { archivos, coincideConFechaReunion }
    }
  } catch (err) {
    console.error('[Propuestas Agente] Drive lookup failed:', err)
  }

  const contextParts: string[] = [
    `Nombre: ${[lead.nombre, lead.apellido].filter(Boolean).join(' ')}`,
  ]
  if (lead.empresa) contextParts.push(`Empresa: ${lead.empresa}`)
  if (lead.pais) contextParts.push(`País: ${lead.pais}`)
  if (lead.sitio_web) contextParts.push(`Sitio web actual: ${lead.sitio_web}`)
  if (lead.servicios_interesados?.length) contextParts.push(`Servicios de interés: ${lead.servicios_interesados.join(', ')}`)
  if (lead.consulta_detallada) contextParts.push(`Proyecto (según la ficha): ${lead.consulta_detallada}`)
  if (lead.presupuesto_estimado) contextParts.push(`Presupuesto que mencionó el lead: ${lead.presupuesto_estimado}`)
  if (lead.fuente) contextParts.push(`Fuente del lead: ${lead.fuente}`)
  if (lead.idioma) contextParts.push(`Idioma del lead: ${lead.idioma} — escribí la propuesta en este idioma si no es español.`)

  const contextBlock = `INFO DEL LEAD:\n${contextParts.join('\n')}`
    + (lead.notas ? `\n\nNOTAS DE LA FICHA (pueden ser notas internas del equipo o la transcripción del bot de captación — usá criterio):\n${lead.notas}` : '')
    + (transcript ? `\n\nCONVERSACIÓN DE WHATSAPP:\n${transcript}` : '')
    + (meetNotes ? `\n\nNOTAS Y TRANSCRIPCIÓN DE LA REUNIÓN (Google Meet):\n${meetNotes}` : '')

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Modo "resumen": antes de escribir nada, el agente cuenta qué encontró
    // (proyecto, reunión, qué falta) y espera confirmación del equipo — no
    // fuerza el tool call ni escribe la propuesta todavía.
    if (modo === 'resumen') {
      const result = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: [
          { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: contextBlock },
          { type: 'text', text: 'Antes de escribir la propuesta, contale al equipo qué encontraste sobre este lead: de qué se trata el proyecto, qué se habló en la reunión (si hay notas o transcripción de Meet), y qué datos importantes todavía faltan para presupuestar bien. Priorizá cubrir lo importante — no hace falta repetir cada detalle de la reunión. NO generes la propuesta todavía, y no agregues una pregunta de cierre — eso se agrega aparte.' },
        ],
        messages: mensajes,
      })
      const text = result.content.find((b) => b.type === 'text')
      if (!text || text.type !== 'text' || !text.text.trim()) {
        // Diagnóstico completo -- si esto vuelve a pasar con 8000 tokens de
        // margen, algo distinto a "se quedó corto" lo está causando (ej.
        // razonamiento interno consumiendo el budget sin dejar lugar al
        // texto visible, o el historial de mensajes en un estado raro).
        console.error('[Propuestas Agente] Resumen sin texto — modelo:', MODEL, 'stop_reason:', result.stop_reason, 'usage:', JSON.stringify(result.usage), 'tipos de bloque:', result.content.map((b) => b.type), 'mensajes.length:', mensajes.length)
      }
      const resumenTexto = text && text.type === 'text' && text.text.trim()
        ? text.text.trim()
        : `No pude generar la respuesta esta vez (motivo: ${result.stop_reason ?? 'desconocido'}, bloques: ${result.content.map((b) => b.type).join(',') || 'ninguno'}, tokens usados: ${result.usage?.output_tokens ?? '?'}) — probá reenviar el mismo mensaje.`
      // La pregunta de cierre se agrega en código, no se le pide al modelo —
      // en la práctica nunca respetaba el límite de longitud y se cortaba
      // antes de llegar a escribirla.
      const mensaje_agente = `${resumenTexto}\n\n¿Avanzo con la propuesta o querés agregar/corregir algo antes?`
      return NextResponse.json({ data: { mensaje_agente, propuesta: null }, reunion_encontrada: reunionEncontrada })
    }

    // El chat solo guarda resúmenes cortos de lo que el agente contestó, no
    // el JSON completo que generó -- sin esto, un pedido de cambio (o algo
    // vago como "hacela de nuevo") se responde a ciegas, sin ver el
    // contenido real que hay que editar.
    const draftBlock = draftActual
      ? { type: 'text' as const, text: `BORRADOR ACTUAL DE LA PROPUESTA (JSON) — si te piden un cambio puntual, partí de este contenido exacto y modificá solo lo pedido, no reescribas todo desde cero salvo que te lo pidan explícitamente:\n${JSON.stringify(draftActual)}` }
      : null

    const result = await client.messages.create({
      model: MODEL,
      max_tokens: 12000,
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: contextBlock },
        ...(draftBlock ? [draftBlock] : []),
      ],
      tools: [PROPOSAL_TOOL],
      tool_choice: { type: 'tool', name: 'responder' },
      messages: mensajes,
    })

    // A propuesta grande (muchos bloques con texto detallado) puede cortarse
    // antes de terminar el JSON si se llega al límite de tokens — en ese caso
    // el tool_use viene incompleto/inválido y NO hay que devolverlo como si
    // fuera una propuesta real.
    if (result.stop_reason === 'max_tokens') {
      return NextResponse.json({ error: 'La propuesta quedó demasiado larga y se cortó — pedile al agente que sea más breve o que use menos bloques.' }, { status: 500 })
    }

    const toolUse = result.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      return NextResponse.json({ error: 'Sin respuesta de IA' }, { status: 500 })
    }

    const input = toolUse.input as { mensaje_agente: string; propuesta: PropuestaContenido }
    if (!input.propuesta || !Array.isArray(input.propuesta.bloques) || !input.propuesta.inversion) {
      console.error('[Propuestas Agente] Tool call incompleto:', JSON.stringify(input).slice(0, 500))
      return NextResponse.json({ error: 'La IA no devolvió una propuesta completa — probá de nuevo.' }, { status: 500 })
    }

    // Segunda llamada, separada: condensa la propuesta ya armada en la
    // versión ejecutiva de 1-2 páginas. Separarla de la generación principal
    // evita que un solo tool call gigante (detallada + resumen) se corte por
    // el límite de tokens — cada llamada es más chica y segura.
    let resumenEjecutivo = null
    try {
      const resumenResult = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: 'Condensá la propuesta detallada de Alora que te paso en una versión ejecutiva de 1-2 páginas: hallazgos (equivalente corto del contexto), un párrafo de la propuesta, lo que incluye, lo que no incluye, y los mismos datos de inversión y tiempos. No inventes nada nuevo, es un resumen.',
        tools: [RESUMEN_EJECUTIVO_TOOL],
        tool_choice: { type: 'tool', name: 'resumen_ejecutivo' },
        messages: [{ role: 'user', content: `Propuesta detallada:\n${JSON.stringify(input.propuesta)}` }],
      })
      const resumenToolUse = resumenResult.content.find((b) => b.type === 'tool_use')
      if (resumenResult.stop_reason !== 'max_tokens' && resumenToolUse && resumenToolUse.type === 'tool_use') {
        resumenEjecutivo = resumenToolUse.input
      }
    } catch (err) {
      console.error('[Propuestas Agente] Resumen ejecutivo falló:', err)
    }

    return NextResponse.json({
      data: {
        mensaje_agente: input.mensaje_agente,
        propuesta: { detallada: input.propuesta, resumen: resumenEjecutivo },
      },
      reunion_encontrada: reunionEncontrada,
    })
  } catch (err) {
    console.error('[Propuestas Agente] Error:', err)
    return NextResponse.json({ error: 'Error generando la propuesta' }, { status: 500 })
  }
}
