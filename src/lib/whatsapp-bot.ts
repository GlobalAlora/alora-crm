import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'
import { matchFaqOrEscalate } from '@/lib/whatsapp-faq'
import { getAvailableSlotsByDay, formatSlotAR, createCalendarEvent } from '@/lib/google-calendar'
import { sendGmail } from '@/lib/google-gmail'
import { notifyAll } from '@/lib/push-notify'

// Fast model for simple extraction tasks (name, portfolio match)
const ANTHROPIC_MODEL = process.env.ANTHROPIC_LEAD_EXTRACT_MODEL || 'claude-haiku-4-5-20251001'
// Best model for the qualifying conversation — this is our most critical business moment
const ANTHROPIC_MODEL_QUALIFYING = process.env.ANTHROPIC_QUALIFYING_MODEL || 'claude-sonnet-5'

// ─── Portfolio cases ──────────────────────────────────────────────────────────
// When a lead describes a project that matches one of these, Lidia shares the
// relevant case study link so they can see real work before the call.
const BASE_SITE = 'https://www.globalalora.com'
const PORTFOLIO_CASES = [
  { name: 'Autodux',           url: `${BASE_SITE}/es/casos-de-exito/autodux`,   teaser: 'un marketplace de compra y venta de autos con catálogo de vehículos, buscador por filtros, panel de agencias y contacto directo por WhatsApp — ideal para concesionarias, dealers o negocios de venta de vehículos' },
  { name: 'Soy LIDIA',        url: `${BASE_SITE}/es/casos-de-exito/soy-lidia`,  teaser: 'una recepcionista virtual por WhatsApp que agenda turnos 24/7, cobra señas y confirma citas automáticamente — activa hoy en clínicas de 4 países' },
  { name: 'ALORA CRM',        url: `${BASE_SITE}/es/casos-de-exito/alora-crm`,  teaser: 'un CRM (sistema de gestión de clientes) con pipeline de ventas automatizado, seguimiento de leads y dashboard en tiempo real — solo relevante si el cliente necesita gestión interna de su negocio' },
  { name: 'Castro Yeso',      url: `${BASE_SITE}/es/casos-de-exito/castro-yeso`, teaser: 'una landing page (sitio de una sola página, sin catálogo ni e-commerce) para un negocio de servicios y oficios — solo relevante si el cliente NO necesita catálogo de productos ni tienda online' },
  { name: 'Escribanía Jalil', url: `${BASE_SITE}/es/casos-de-exito/escribania-jalil`, teaser: 'un sitio para un estudio de escribanía, con información de servicios notariales/legales y contacto directo — solo relevante para negocios de servicios profesionales, sin catálogo de productos ni tienda online' },
  { name: 'ALKEMIA',          url: `${BASE_SITE}/es/casos-de-exito/alkemia`,    teaser: 'un sitio institucional bilingüe para posicionarse en el mercado tech e IA a nivel internacional' },
  { name: 'Distri-Sal',       url: `${BASE_SITE}/es/casos-de-exito/distrisal`,  teaser: 'un ecommerce con catálogo de productos integrado con su sistema de gestión para sincronizar stock y precios en tiempo real — ideal para distribuidoras o mayoristas' },
  { name: 'Voutier Repuestos', url: `${BASE_SITE}/es/casos-de-exito/voutier`,   teaser: 'una tienda online de repuestos automotrices con catálogo filtrable por marca, modelo y año — ideal para negocios de autopartes o repuestos' },
  { name: 'Mimi Kids',        url: `${BASE_SITE}/es/casos-de-exito/mimikids`,   teaser: 'una tienda online para emprendimiento artesanal con catálogo interactivo, personalización de productos y pagos con MercadoPago' },
] as const

async function findPortfolioMatch(text: string): Promise<typeof PORTFOLIO_CASES[number] | null> {
  if (!text || text.trim().length < 5) return null
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  const casesList = PORTFOLIO_CASES.map((c, i) => `${i + 1}. ${c.name}: ${c.teaser}`).join('\n')
  try {
    const client = new Anthropic({ apiKey })
    const result = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 5,
      messages: [{
        role: 'user',
        content: `A potential client described their project: "${text}"\n\nWhich of these past projects (if any) was built for a CLEARLY SIMILAR type of use case?\n${casesList}\n\nIMPORTANT: Only pick a number if the core product type is the same (e.g. both are e-commerce stores, both are booking bots, both are service-business websites with WhatsApp contact). A superficial similarity (both mention WhatsApp, both involve a list of items) is NOT enough. Return 0 if there is no clearly matching project or if you are unsure. Reply with ONLY the number (1-${PORTFOLIO_CASES.length}) or 0. One digit only.`,
      }],
    })
    const raw = (result.content[0] as { type: string; text: string }).text?.trim() ?? '0'
    const idx = parseInt(raw, 10) - 1
    return idx >= 0 && idx < PORTFOLIO_CASES.length ? PORTFOLIO_CASES[idx] : null
  } catch {
    return null
  }
}

function buildPortfolioMsg(match: typeof PORTFOLIO_CASES[number] | null, lang: Lang): string | null {
  if (!match) return null
  if (lang === 'en') {
    return `By the way — we've done something similar! 👀 We built ${match.teaser} for *${match.name}*.\nCheck it out here: ${match.url}`
  }
  return `¡Por cierto! Hicimos algo parecido 👀 Para *${match.name}* construimos ${match.teaser}.\nPodés verlo acá: ${match.url}`
}

async function extractNameWithAI(raw: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return ''

  // Fast-path: reject obvious non-name phrases without an API call.
  // Catches temporal/contextual messages like "Hace rato estuvimos hablando".
  const NON_NAME_RE = /\b(hace\s+(un\s+)?rato|estuvimos\s+habl|ya\s+habl|ya\s+nos\s+|antes\s+habl|para\s+qu[eé]|qu[eé]\s+necesit|no\s+s[eé]|quien\s+(es|sos)|c[oó]mo\s+est[aá]|de\s+d[oó]nde|necesito\s+|quiero\s+|busco\s+|tengo\s+una?\s+|me\s+pueden|pueden\s+|buenas?\s+(d[ií]as?|tardes?|noches?))\b/i
  if (NON_NAME_RE.test(raw.trim())) return ''

  try {
    const client = new Anthropic({ apiKey })
    const result = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: `You are processing a Spanish WhatsApp reply to the question "¿Cómo te llamás?" (What's your name?). Extract the person's name if and only if they actually gave one. Reply with ONLY the name (e.g. "Raúl" or "María José"). Reply with exactly "NONE" for anything that is not a name: sentences, questions, greetings, phrases like "Hace rato estuvimos hablando", "Para que lo necesitan", "Hola", etc.\n\nMessage: "${raw}"`,
      }],
    })
    const text = (result.content[0] as { type: string; text: string }).text?.trim() ?? ''
    return text === 'NONE' || !text ? '' : text
  } catch {
    return ''
  }
}

type AdminClient = ReturnType<typeof createAdminClient>

// Leads already in this list are existing clients — Lidia must never engage
// them (they're usually writing about something unrelated to a new lead),
// no matter what state their conversation is in.
const CLIENT_LIST_NAME = 'CLIENTES ALORA'

export async function isClientLead(admin: AdminClient, leadId: string): Promise<boolean> {
  const { data: list } = await admin
    .from('lists')
    .select('id')
    .eq('name', CLIENT_LIST_NAME)
    .maybeSingle()

  if (!list) return false

  const { data } = await admin
    .from('list_leads')
    .select('lead_id')
    .eq('list_id', list.id)
    .eq('lead_id', leadId)
    .maybeSingle()

  return !!data
}

// Strips greeting words from a name answer ("hola soy Nahuel" → "Nahuel")
function extractName(raw: string): string {
  const cleaned = raw
    .replace(/^(hola[,!]?\s*)?(soy|me llamo|mi nombre es|me dicen|soy el|soy la|soy)\s+/i, '')
    .replace(/^(hi[,!]?\s*)?(i am|i'm|my name is|they call me)\s+/i, '')
    .replace(/^hola[,!]?\s*/i, '')
    .replace(/^hi[,!]?\s*/i, '')
    .trim()
  const words = (cleaned || raw.trim()).split(/\s+/)
  return words.slice(0, 2).join(' ')
}

// Detect whether a message is written in English.
// Returns 'en' if 2+ English indicator words are found, otherwise 'es'.
function detectLanguage(text: string): 'en' | 'es' {
  if (!text) return 'es'
  const hits = text.match(/\b(i am|i'm|i'd|i've|i'll|i would|i need|i want|hello|hi there|hey there|my name is|please|thank you|thanks|what are|how do|can you|do you|are you|services|website|marketing|design|looking for|interested in|recently|submitted|let me know|your team|find out|more about|we are|we're|our company|our business|my company|my business|we need|we want|we would|could you|would you|digital marketing|web design|social media|branding)\b/gi)
  return hits && hits.length >= 2 ? 'en' : 'es'
}
type Lang = 'en' | 'es'

// Order in which the qualifying bot asks for missing info.
// "nombre" and "consulta_detallada" are free-text answers we save directly
// (no AI inference) and are always asked once, regardless of whether the
// lead already has a placeholder value (e.g. the WhatsApp profile name).
const QUESTION_ORDER = ['nombre', 'consulta_detallada', 'servicios_interesados', 'email', 'empresa', 'sitio_web', 'pais'] as const
type QuestionField = typeof QUESTION_ORDER[number]
const DIRECT_SAVE_FIELDS = new Set<QuestionField>(['nombre', 'consulta_detallada'])

// Fields where we push back once instead of silently accepting a non-answer
// (e.g. "no tengo" to the email question) and moving on. After one retry we
// accept whatever comes back, so we never loop forever on it.
const VALIDATORS: Partial<Record<QuestionField, { isValid: (text: string) => boolean; pushback: string }>> = {
  nombre: {
    isValid: (t) => t.trim().split(/\s+/).length <= 5 && t.trim().length <= 50,
    pushback: '¿Me podés decir solo tu nombre? 😊',
  },
  email: {
    isValid: (t) => /\S+@\S+\.\S+/.test(t),
    pushback: 'Te pido el email puntualmente porque es importante para que el equipo te pueda hacer seguimiento — ¿tenés alguno que me puedas pasar? 🙏',
  },
  consulta_detallada: {
    isValid: (t) => t.trim().split(/\s+/).length >= 5,
    pushback: '¿Me podés contar un poco más en detalle? Cuanto más contexto me das, mejor te puede ayudar el equipo 🙏',
  },
}

// Detect farewell / disengagement messages so Lidia doesn't keep qualifying
// someone who is saying goodbye or postponing.
const DISENGAGEMENT_RE = /\b(postergar|posponer|pausar el proyecto|cancelar|lo dejamos|lo pausamos|no vamos a poder|no podemos continuar|no voy a poder|decidimos no|por el momento no|por ahora no|hasta pronto|hasta luego|gracias por todo|gracias por sus servicios|gracias por la atención|gracias por su atención|gracias a todos|agradecemos tu gestión|agradecemos la gestión|inconveniente económico|inconveniente economico|dificultades económicas|no seguir|no continuar|no tengo nada|no tengo proyecto|era mentira|te mentí|te menti|me equivoqué|me equivoque|era un chiste|era broma|estaba probando|lo dejo|dejalo|no me interesa|no estoy interesado|no estoy interesada|no voy a contratar|no vamos a contratar|chau|adios|adiós|bye|hasta ahí|hasta ahi|ya no preciso|no preciso el|no necesito el servicio|ya no necesito|no requiero|ya no requiero|no voy a necesitar|decidí no|decidi no|no voy a seguir|no vamos a seguir|no hace falta|no lo necesito|no nos interesa)\b/i
const DISENGAGEMENT_RE_EN = /\b(postpone|putting on hold|pause the project|cancel|hold off|not moving forward|not going to proceed|decided not to|not for now|not at this time|goodbye|bye for now|thanks for everything|financial difficulties|budget issues|can't continue|won't be able to|no longer interested|leaving it|dropping it|not interested|not going to hire|going with someone else)\b/i

// Detect job seekers so Lidia doesn't treat them as potential clients.
const JOB_INQUIRY_RE = /\b(postulac[ií]|postularme|postularse|recibir\s+postulaciones?|abiertos?\s+(a\s+)?incorporar|incorporar(se|nos|me)|unirme\s+al\s+(equipo|team)|sumarme\s+al\s+(equipo|team)|formar\s+parte\s+(del\s+equipo|de\s+alora|de\s+su\s+equipo)|curr[ií]culum\s+vitae|\bcurr[ií]culum\b|vacante|oferta\s+laboral|busco\s+(trabajo|empleo)|en\s+búsqueda\s+(activa\s+)?(de\s+)?(trabajo|empleo)|looking\s+for\s+(a\s+)?job|join\s+(your\s+)?(team|company)|aplicar\s+(al?\s+)?(puesto|posici[oó]n|cargo))\b/i

const QUESTION_TEXT: Record<QuestionField, string> = {
  nombre:                '¿Cómo te llamás?',
  consulta_detallada:    'Contame un poco más sobre lo que necesitás — así el equipo puede entender mejor tu proyecto 🙂',
  email:                 '¿Me dejás tu email? Así el equipo puede hacerte seguimiento 📧',
  empresa:               '¿Tenés empresa o negocio? ¿Cómo se llama? 😊',
  sitio_web:             '¿Ya tenés sitio web? Si tenés, pasame el link — si no, sin problema, no es obligatorio 🙂',
  pais:                  '¿Desde qué país nos escribís?',
  servicios_interesados: '¿En qué servicio estás pensando? (diseño web, apps, redes sociales, branding, marketing... lo que sea 😊)',
}
const QUESTION_TEXT_EN: Record<QuestionField, string> = {
  nombre:                "What's your name?",
  consulta_detallada:    "Tell me a bit more about what you need — so the team can better understand your project 🙂",
  email:                 "Could I get your email? That way the team can follow up with you 📧",
  empresa:               "Do you have a company or business? What's it called? 😊",
  sitio_web:             "Do you already have a website? Share the link if you do — no worries if not 🙂",
  pais:                  "Which country are you writing from?",
  servicios_interesados: "Which service are you thinking about? (web design, apps, social media, branding, marketing... anything! 😊)",
}

function getQuestionText(field: QuestionField, lang: Lang): string {
  return lang === 'en' ? QUESTION_TEXT_EN[field] : QUESTION_TEXT[field]
}

function getPushback(field: QuestionField, lang: Lang): string {
  if (lang === 'en') {
    switch (field) {
      case 'nombre': return "Could you share just your name? 😊"
      case 'email': return "I'm asking for your email specifically because it's important for the team to follow up with you — do you have one you can share? 🙏"
      case 'consulta_detallada': return "Could you tell me a bit more in detail? The more context you give me, the better the team can help you 🙏"
    }
  }
  return VALIDATORS[field]?.pushback ?? ''
}

/**
 * Returns a short, natural acknowledgment for the field that was just answered.
 * Varies by field, answer content, and language.
 */
function getAcknowledgment(field: QuestionField, answer: string, leadNombre?: string | null, lang: Lang = 'es'): string {
  switch (field) {
    case 'nombre': {
      const firstName = answer.trim().split(/\s+/)[0]
      const options = lang === 'en'
        ? [`Hi, ${firstName}! Great to meet you 😊`, `Nice to meet you, ${firstName}! 🙂`, `Great to have you here, ${firstName}! 😊`]
        : [`¡Hola, ${firstName}! Un gusto 😊`, `¡Encantada, ${firstName}! 🙂`, `¡Qué bueno tenerte acá, ${firstName}! 😊`]
      return options[Math.floor(Math.random() * options.length)]
    }
    case 'consulta_detallada': {
      const options = lang === 'en'
        ? ['Got it, the project is clear! 🙌', 'Perfect, understood! Sounds really interesting 🙌', 'Great, noted everything! 📝']
        : ['¡Copado, me queda claro el proyecto! 🙌', '¡Perfecto, entendido! Suena muy interesante 🙌', '¡Genial, anoto todo! 📝']
      return options[Math.floor(Math.random() * options.length)]
    }
    case 'email': {
      return lang === 'en' ? 'Perfect, noted! 📝' : '¡Perfecto, lo tomo nota! 📝'
    }
    case 'empresa': {
      if (lang === 'en') {
        if (/\bno\b|don't have|\bnone\b|no company/i.test(answer)) return "No worries! 🙂"
        return [  'Awesome! 💪', 'Great! 🙌', 'Nice! 😊'][Math.floor(Math.random() * 3)]
      }
      if (/\bno\b|\bsin\b|\bninguna\b|\bno tengo\b/i.test(answer)) return '¡Tranquilo, no hay problema! 🙂'
      return ['¡Buenísimo! 💪', '¡Genial! 🙌', '¡Qué bien! 😊'][Math.floor(Math.random() * 3)]
    }
    case 'sitio_web': {
      if (lang === 'en') {
        if (/\bno\b|don't have|not yet|\bnone\b/i.test(answer)) return "No problem at all! 🙂"
        return 'Great, noted! 🙌'
      }
      if (/\bno\b|\bsin\b|\btodavía\b|\baún\b|\bno tengo\b/i.test(answer)) return '¡Sin problema, no hace falta! 🙂'
      return '¡Genial, lo anoto! 🙌'
    }
    case 'pais': {
      return lang === 'en' ? 'Awesome, greetings from here! 🙌' : '¡Buenísimo, un saludo desde acá! 🙌'
    }
    case 'servicios_interesados': {
      const options = lang === 'en'
        ? ['Perfect! 🙌', 'Awesome, I\'ll keep that in mind! 😊', 'Got it! 💪']
        : ['¡Perfecto! 🙌', '¡Buenísimo, lo tengo en cuenta! 😊', '¡Entendido! 💪']
      return options[Math.floor(Math.random() * options.length)]
    }
    default:
      return lang === 'en' ? 'Perfect! 🙌' : '¡Perfecto! 🙌'
  }
}

const WELCOME  = '¡Hola! 👋 Soy Lidia, de Alora. ¡Qué alegría que nos escribas! 🙂'
const WELCOME_EN = "Hi there! 👋 I'm Lidia from Alora. So glad you reached out! 🙂"
function getWelcome(lang: Lang): string { return lang === 'en' ? WELCOME_EN : WELCOME }

const CLOSING_FALLBACK = '¡Listo, ya tengo todo lo que necesitaba! 🎉 Gracias por tu paciencia.\n\n'
  + 'Te propongo agendar una llamada de relevamiento rápida con Walo, así charlan tranquilos sobre lo que necesitás:\n'
  + 'https://www.globalalora.com/es/llamada-de-relevamiento\n\n'
  + 'Elegí el horario que más te quede cómodo y ahí se conectan 💛\n\n'
  + 'Mientras tanto, si tenés alguna otra duda, escribime tranquilo que te ayudo 🙂'
const CLOSING_FALLBACK_EN = "All set, I have everything I need! 🎉 Thanks for your patience.\n\n"
  + "I'd like to invite you to schedule a quick discovery call with Walo, so you can chat about what you need:\n"
  + "https://www.globalalora.com/es/llamada-de-relevamiento\n\n"
  + "Pick the time that works best for you 💛\n\n"
  + "Meanwhile, if you have any other questions, feel free to ask 🙂"
function getClosingFallback(lang: Lang): string { return lang === 'en' ? CLOSING_FALLBACK_EN : CLOSING_FALLBACK }

const HANDOFF  = 'Te derivo con alguien del equipo para que te ayude mejor con esto 🙂 En breve te responden. Si en algún momento querés volver a hablar conmigo, escribí *MENÚ*.'
const HANDOFF_EN = "I'm connecting you with someone from the team to better help you with this 🙂 They'll be in touch shortly. If you'd like to talk to me again at any point, just type *MENU*."
function getHandoff(lang: Lang): string { return lang === 'en' ? HANDOFF_EN : HANDOFF }

const BOOKING_SLOTS_PREFIX   = 'booking_slots:::'
const BOOKING_CONFIRM_PREFIX = 'booking_confirm:::'

interface LeadSnapshot {
  nombre: string | null
  email: string | null
  empresa: string | null
  sitio_web: string | null
  pais: string | null
  servicios_interesados: string[] | null
  consulta_detallada: string | null
}

function isFieldFilled(lead: LeadSnapshot, field: QuestionField): boolean {
  // Always ask once — the WhatsApp profile name isn't a real answer, and
  // there's no other source for the detailed inquiry.
  if (DIRECT_SAVE_FIELDS.has(field)) return false
  if (field === 'servicios_interesados') return !!lead.servicios_interesados?.length
  return !!lead[field]
}

/**
 * Entry point: routes to the qualifying flow or FAQ mode depending on where
 * this conversation is at. Does nothing if a human has taken over
 * (bot_active = false).
 */
export async function runBot(
  admin: AdminClient,
  { leadId, conversationId, phone, text }: { leadId: string; conversationId: string; phone: string; text: string | null },
): Promise<void> {
  if (await isClientLead(admin, leadId)) {
    console.log(`[Bot] PAUSE reason=client_list phone=${phone} conv=${conversationId}`)
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    return
  }

  // Leads in the 'consulta_cliente' stage are existing clients — never engage.
  const { data: leadStage } = await admin
    .from('leads')
    .select('estado_pipeline, nombre, apellido')
    .eq('id', leadId)
    .single()

  if (leadStage?.estado_pipeline === 'consulta_cliente' || leadStage?.estado_pipeline === 'testing') {
    console.log(`[Bot] PAUSE reason=${leadStage.estado_pipeline} phone=${phone} conv=${conversationId}`)
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    return
  }

  if (leadStage?.estado_pipeline === 'no_cualificado') {
    // Lead was disqualified but reached out again — move back to lead_entrante so the
    // team can review, and fire a push notification so no opportunity is missed.
    console.log(`[Bot] no_cualificado lead recontacted — moving to lead_entrante phone=${phone}`)
    await admin.from('leads').update({ estado_pipeline: 'lead_entrante' }).eq('id', leadId)
    await admin.from('activities').insert({
      lead_id:     leadId,
      user_id:     null,
      tipo:        'nota',
      descripcion: 'Recontactó por WhatsApp estando en No cualificado — movido a Lead entrante para revisión.',
    })
    const leadLabel = [leadStage.nombre, leadStage.apellido].filter(Boolean).join(' ') || `+${phone}`
    notifyAll({
      title: `♻️ Recontacto — ${leadLabel}`,
      body:  'Estaba en "No cualificado" y volvió a escribir. Lo movimos a Lead entrante.',
      url:   `/leads/${leadId}`,
    }).catch(() => {})
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    return
  }

  const { data: convo } = await admin
    .from('whatsapp_conversations')
    .select('bot_active, bot_phase, bot_next_question, bot_language, last_message_at')
    .eq('id', conversationId)
    .single()

  if (!convo || convo.bot_active === false) {
    // The bot goes silent when paused (human handoff) — but the lead was
    // told they can type "menú" to come back. Without this, that promise
    // was empty: every message just got ignored forever, "menú" included.
    const MENU_RE = /^\s*men[uú]\s*$/i
    if (convo && MENU_RE.test(text ?? '')) {
      const reactivateLang = (convo.bot_language ?? 'es') as Lang
      await admin.from('whatsapp_conversations')
        .update({ bot_active: true, bot_phase: 'faq', bot_next_question: null })
        .eq('id', conversationId)
      await sendOutboundWhatsAppMessage(admin, {
        conversationId, leadId, phone,
        body: reactivateLang === 'en'
          ? "Welcome back! 😊 Want to keep going with your project or set up the call with Walo?"
          : '¡Volviste! 😊 ¿Seguimos con tu proyecto o coordinamos la llamada con Walo?',
      })
    }
    // Deliberately silent otherwise (anything but "menú" while paused).
    // A reminder-once version of this was tried and reverted: bot_active
    // false doesn't only mean "waiting for the team to call back" — it's
    // also the state while a human (Walo/Bruno) is personally handling the
    // conversation live from WhatsApp itself (e.g. mid-meeting-coordination).
    // Auto-injecting a bot message into that is worse than staying quiet —
    // it visibly cut into a real lead's conversation with a human mid-call.
    console.log(`[Bot] SKIP phone=${phone} conv=${conversationId} bot_active=${convo?.bot_active} phase=${convo?.bot_phase}`)
    return
  }

  console.log(`[Bot] START phone=${phone} phase=${convo.bot_phase ?? 'qualifying'} next_q=${convo.bot_next_question ?? 'null'}`)

  // Language persistence: once detected as English it stays English.
  // Explicit requests ("hablame en español" / "in english please") override the stored value.
  const storedLang = (convo.bot_language ?? 'es') as Lang
  const detectedLang = detectLanguage(text ?? '')
  const explicitSpanish = /\b(en espa[nñ]ol|hablame en espa[nñ]ol|hablemos en espa[nñ]ol|por favor en espa[nñ]ol|prefiero espa[nñ]ol|podes? hablar en espa[nñ]ol|en castellano|hablame en castellano)\b/i.test(text ?? '')
  const explicitEnglish = /\b(in english|speak english|please in english|respond in english|english please|prefer english|can you speak english)\b/i.test(text ?? '')
  let lang: Lang
  if (explicitSpanish) lang = 'es'
  else if (explicitEnglish) lang = 'en'
  else lang = storedLang === 'en' ? 'en' : detectedLang
  if (lang !== storedLang) {
    await admin.from('whatsapp_conversations').update({ bot_language: lang }).eq('id', conversationId)
  }

  if (convo.bot_phase === 'faq') {
    await handleFaqPhase(admin, { leadId, conversationId, phone, text, lang })
    return
  }

  if (convo.bot_phase === 'booking') {
    await handleBookingPhase(admin, { leadId, conversationId, phone, text, botNextQuestion: convo.bot_next_question, lastMessageAt: convo.last_message_at, lang })
    return
  }

  if (convo.bot_phase === 'qualifying_ai') {
    await advanceQualifyingBotWithAI(admin, { leadId, conversationId, phone, text, lang })
    return
  }

  await advanceQualifyingBot(admin, { leadId, conversationId, phone, text, botNextQuestion: convo.bot_next_question, lang })
}

// ── AI-powered qualifying prompts ─────────────────────────────────────────────

const QUALIFYING_AI_SYSTEM_ES = `Sos Lidia, la recepcionista virtual de Alora por WhatsApp. Alora es una agencia de tecnología digital: sitios web, apps, ecommerce, bots de WhatsApp y sistemas de gestión para empresas y emprendedores de toda América Latina.

Tu objetivo: entender el proyecto del lead y agendar una videollamada de 30 minutos con Walo, uno de los fundadores de Alora.

PERSONALIDAD:
- Cálida y cercana, como hablar con alguien inteligente que genuinamente quiere ayudar — nunca robótica ni formulario
- Genuinamente curiosa por el negocio del lead
- Hacés preguntas inteligentes que muestran que entendiste lo que te dijeron
- Transmitís entusiasmo real cuando el proyecto es interesante

INFO QUE NECESITÁS RECOPILAR (en este orden estricto, las 4 son ESENCIALES — sin las 4 no se agenda nada):
1. Descripción del proyecto (esto va PRIMERO siempre)
2. País
3. Sitio web actual — si no tiene, que te lo diga ("no tengo" cuenta como respuesta válida, no hace falta que tenga uno)
4. Email — se pide junto con la explicación de la videollamada, no antes (ver "SOBRE EL EMAIL" más abajo)

Empresa/negocio es un dato lindo de tener pero NO bloquea el paso a booking — no insistas por eso.

REGLA DE ORO — PRIMERO EL PROYECTO:
- Si no sabés todavía QUÉ quiere el lead, preguntá eso antes que cualquier otra cosa. Nunca país, sitio web ni email antes.
- "Me interesa conocer sus servicios", "hola", "buenas", "quiero saber más" → NO son proyectos. Preguntá "¿qué proyecto tenés en mente?" o "¿en qué te podemos ayudar?"
- Nunca pidas el email como pregunta aislada y sin contexto — siempre va junto con la explicación de para qué es la videollamada (ver "SOBRE EL EMAIL")

DEMOSTRÁ QUE ENTENDISTE (esto sorprende al lead y genera confianza):
Cuando el lead describe su proyecto, hacé UNA pregunta de seguimiento inteligente que muestre que entendiste. Los leads se sorprenden cuando ven que no sos un bot genérico. Ejemplos:
- "tengo una empresa de sexshop" → "¡Buenísimo! ¿Estás pensando en una tienda online con catálogo y carrito de compras, o más una web de presentación con contacto por WhatsApp?"
- "quiero un sitio para mi peluquería" → "¡Qué bueno! ¿Necesitás también que los clientes puedan reservar turno desde el sitio, o con una buena página de presentación alcanza?"
- "necesito una app" → "¡Interesante! ¿La app sería para tus clientes, para gestión interna de tu equipo, o para las dos cosas?"
- "quiero un bot como el de mi amiga" → "¡Perfecto! ¿Para responder consultas automáticamente, agendar turnos, o algo más específico?"
- "tengo un emprendimiento de ropa" → "¡Genial! ¿Estás buscando una tienda online con MercadoPago, o más una presencia digital para mostrar la marca?"
- "quiero un sistema para mis clientes" → "¡Buenísimo! ¿Para gestionar turnos, llevar seguimiento de ventas, o qué parte del negocio querés organizar mejor?"

REGLAS DE CONVERSACIÓN:
- Mensajes cortos — dos o tres líneas máximo, como WhatsApp entre conocidos
- Una sola pregunta por mensaje, siempre
- Reconocé siempre lo que dijeron antes de preguntar algo nuevo
- Si mencionan varios proyectos: "¡Qué interesante, son dos proyectos! ¿Por cuál arrancamos?"
- "uno", "otro", "tengo uno", "el mío" NUNCA son respuestas negativas — son proyectos o negocios
- IMPORTANTE — estas 4 respuestas de abajo mencionan "la llamada"/"videollamada": pueden dispararse en cualquier momento de la conversación, incluso ANTES de haberla propuesto formalmente (por ejemplo si preguntan precio muy temprano). Cada una tiene que presentar la llamada como algo que estás proponiendo ahí mismo, nunca como algo que el lead ya debería conocer — no digas "la llamada con Walo" a secas como si ya se hubiera hablado de eso
- Si prefieren solo WhatsApp: "Entiendo, pero sin una charla previa no puedo armar algo a medida — te propongo 30 minutos con Walo, sin compromiso 🙂"
- Si preguntan precios: "Los costos dependen del proyecto — por eso te propongo una videollamada de 30 min con Walo, así lo ven juntos y él te da una idea clara 🙂"
- Si preguntan para qué sirve la llamada: "Es para que Walo entienda bien tu proyecto y pueda preparar algo a medida — sin esa charla no podemos armar un presupuesto que tenga sentido 🙂"
- Si dudan sobre el tiempo: "Son solo 30 minutos con Walo y elegís el horario que más te quede bien"
- Si mandan solo un link sin descripción: pediles que cuenten brevemente qué necesitan
- Si la descripción es muy vaga: hacé una pregunta inteligente de follow-up (como los ejemplos de arriba), no pidas "más detalle" genéricamente
- Nunca rompas el personaje
- Si el lead se despide o quiere pausar: respondé amablemente, deseale suerte

SOBRE EL EMAIL — OBLIGATORIO, SIN EXCEPCIÓN:
- Se pide recién cuando ya tenés proyecto + país + sitio web, SIEMPRE junto con la explicación de para qué es la videollamada — nunca lo pidas "en seco", sin contexto
- La razón que das tiene que ser CONCRETA y en una sola frase corta: es para entender bien el proyecto y armar un presupuesto/propuesta que tenga sentido. NO inventes otras razones ni uses palabras vagas como "la charla", "prepararse", "prepararla" — eso genera confusión, no explica nada
- Explicá primero, pedí después, en el mismo mensaje: "Para armarte un presupuesto a medida, te propongo una videollamada de 30 min con Walo, uno de los fundadores. ¿Me pasás tu email para registrar tu consulta y mostrarte los horarios disponibles?"
- IMPORTANTE: en este mensaje el lead todavía NO eligió día ni hora — nunca digas "para mandarte la confirmación" ni "el link" acá, porque no hay nada confirmado todavía y lo puede confundir o asustar. Esas palabras (confirmación, link) recién van DESPUÉS de que el lead elija un horario, no antes
- Es un dato obligatorio: SIN EMAIL NO SE AGENDA LA LLAMADA. Si no lo da, no pases a mostrar horarios — insistí con calidez, no dejes pasar
- Si no quiere darlo la primera vez: "Lo necesito sí o sí para poder mostrarte los horarios disponibles 🙂 ¿Cuál me pasás?"
- Si sigue sin darlo: seguí preguntando de otra forma, con paciencia, pero NUNCA avances a booking sin el email — no hay excepción ni "seguimos igual"
- Si ya te lo dio antes en la conversación, no lo pidas de nuevo

CUANDO VAS A BOOKING (recién cuando tenés proyecto + país + sitio web + email, las 4 cosas):
- Mencioná el proyecto del lead con sus palabras y transmití entusiasmo genuino
- Hacelo sentir que la llamada va a ser valiosa y que el equipo va a estar preparado
- Ejemplo (personalizalo con el proyecto real, NO copies esto): "¡Perfecto Ana! Ya tengo todo lo que Walo necesita sobre tu ecommerce de ropa 🙌 Se va a preparar bien para la charla — en un momento te muestro los horarios disponibles."
- NO incluyas los horarios en tu mensaje — el sistema los envía automáticamente después

PORTAFOLIO (mencioná orgánicamente — máximo una vez, solo si hay match muy claro):
- Primero fijate si el negocio del lead es un SERVICIO (no vende productos — ej. fletes, gestoría, asesoría, yesería, escribanía) o un PRODUCTO/TIENDA (vende algo con catálogo — ej. repuestos, ropa, insumos). Elegí un ejemplo de la MISMA categoría — nunca le muestres una tienda a alguien que ofrece un servicio, ni al revés, aunque no tengas un caso 100% idéntico a su rubro

Servicios:
- Castro Yeso: landing page ONE-PAGE para servicios — SIN catálogo ni tienda → https://www.globalalora.com/es/casos-de-exito/castro-yeso
- Escribanía Jalil: sitio para un estudio de escribanía (servicios legales/notariales) → https://www.globalalora.com/es/casos-de-exito/escribania-jalil
- ALKEMIA: sitio institucional bilingüe → https://www.globalalora.com/es/casos-de-exito/alkemia

Productos / tiendas:
- Autodux: marketplace de autos para concesionarias (catálogo, búsqueda, WhatsApp) → https://www.globalalora.com/es/casos-de-exito/autodux
- Distri-Sal: ecommerce con sincronización de stock en tiempo real → https://www.globalalora.com/es/casos-de-exito/distrisal
- Voutier: tienda de repuestos automotrices con catálogo filtrable → https://www.globalalora.com/es/casos-de-exito/voutier
- Mimi Kids: tienda artesanal con catálogo + MercadoPago → https://www.globalalora.com/es/casos-de-exito/mimikids

Otros:
- Soy LIDIA: bot de WhatsApp para clínicas (agenda 24/7, cobro de señas) → https://www.globalalora.com/es/casos-de-exito/soy-lidia
- ALORA CRM: sistema de gestión de leads y ventas (SOLO si el cliente necesita gestión interna de su negocio) → https://www.globalalora.com/es/casos-de-exito/alora-crm

- Si preguntan por casos de campañas de Google Ads puntualmente: "No tenemos casos de campañas de Ads para mostrarte, pero todas las páginas que hacemos quedan listas para correr Google Ads arriba sin problema 🙂" — y ahí sí podés mostrar un caso de portafolio de la categoría que corresponda (servicio o tienda), aclarando que es de la web, no de la campaña

IR A BOOKING: cuando tenés descripción del proyecto + país + sitio web + email — las 4, sin excepción. Nunca vayas a booking sin email.
IR A STOP: si el lead claramente no quiere continuar. Respondé amablemente antes de parar.`

const QUALIFYING_AI_SYSTEM_EN = `You are Lidia, Alora's virtual receptionist on WhatsApp. Alora is a digital technology agency: websites, apps, e-commerce, WhatsApp bots, and management systems for businesses and entrepreneurs across Latin America.

Your goal: understand the lead's project and schedule a 30-minute video call with Walo, one of Alora's founders.

PERSONALITY:
- Warm and friendly, like talking to a smart person who genuinely wants to help — never robotic or form-like
- Genuinely curious about the lead's business
- You ask intelligent follow-up questions that show you understood what they said
- You express real enthusiasm when the project is interesting

INFO TO COLLECT (in this strict order, all 4 are ESSENTIAL — without all 4, nothing gets booked):
1. Project description (this goes FIRST, always)
2. Country
3. Existing website — if they don't have one, they should just say so ("I don't have one" counts as a valid answer, they don't need to actually have a site)
4. Email — asked together with the explanation of the video call, not before (see "ABOUT THE EMAIL" below)

Company/business name is nice to have but does NOT block moving to booking — don't push for it.

GOLDEN RULE — PROJECT FIRST:
- If you don't yet know WHAT the lead wants, ask that before anything else. Never country, website, or email first.
- "I'm interested in your services", "hello", "hi", "I want to learn more" → NOT project descriptions. Ask "what project do you have in mind?"
- Never ask for email as an isolated, out-of-context question — it always comes bundled with explaining what the video call is for (see "ABOUT THE EMAIL")

SHOW YOU UNDERSTOOD (what surprises the lead and builds trust):
When the lead describes their project, ask ONE intelligent follow-up question that shows you understood. They're surprised to see you're not just a generic bot. Examples:
- "I have a clothing store" → "Nice! Are you looking for an online store with a cart and payments, or more of a brand presentation page with WhatsApp contact?"
- "I need an app" → "Interesting! Would the app be for your customers, for your internal team, or both?"
- "I want a bot like my friend's" → "Perfect! Is it to answer questions automatically, schedule appointments, or something more specific?"
- "I need a website for my business" → "Great! Do you need something that sells online, or more of a professional presence to generate contacts?"
- "I want a system to manage clients" → "Excellent! To manage appointments, track sales, or what part of your business do you want to organize better?"

CONVERSATION RULES:
- Short messages — two or three lines max, like texting a friend
- One question per message, always
- Always acknowledge what they said before asking something new
- If they mention multiple projects: "How interesting — two projects! Which should we start with?"
- "one", "another", "I have one" are NEVER negative — they're projects or businesses
- IMPORTANT — these 4 replies below mention "the call"/"video call": they can fire at any point in the conversation, even BEFORE you've formally proposed it (e.g. if they ask about pricing very early). Each one has to present the call as something you're proposing right there, never as something the lead should already know about — don't say "the call with Walo" as if it's already been discussed
- If they prefer WhatsApp only: "I understand, but without a quick call I can't put together something tailored — I'd suggest 30 minutes with Walo, no commitment 🙂"
- If they ask about pricing: "Costs depend on the project — that's exactly why I'd suggest a 30-minute video call with Walo, so you can figure it out together and he can give you a clear idea 🙂"
- If they ask what the call is for: "It's so Walo can understand your project and prepare something tailored — without that chat we can't put together a quote that makes sense 🙂"
- If they hesitate about time: "It's just 30 minutes with Walo and you pick the time that works best"
- Never break character
- If the lead says goodbye or wants to pause: respond warmly, wish them luck

ABOUT THE EMAIL — REQUIRED, NO EXCEPTIONS:
- Only ask once you already have project + country + website, and ALWAYS together with explaining what the video call is for — never ask it cold, with no context
- The reason you give must be CONCRETE and one short sentence: it's to understand the project well and put together a quote/proposal that makes sense. Do NOT invent other reasons or use vague words like "the chat", "get ready", "prepare for it" — that just confuses, it doesn't explain anything
- Explain first, ask second, in the same message: "To put together a tailored quote, I'd like to set up a 30-minute video call with Walo, one of Alora's founders. Can I get your email so I can register your inquiry and show you the available times?"
- IMPORTANT: at this point the lead hasn't picked a day or time yet — never say "to send you the confirmation" or "the link" here, since nothing is confirmed yet and it can confuse or worry them. Those words (confirmation, link) only belong AFTER the lead picks a time, not before
- This is a required field: NO EMAIL, NO BOOKING. If they don't give it, don't move on to showing time slots — keep asking warmly, don't let it go
- If they don't want to share it the first time: "I really do need it so I can show you the available times 🙂 Which one can you give me?"
- If they still don't give it: keep asking a different way, patiently, but NEVER go to booking without the email — there's no exception, no "proceeding anyway"
- If they already gave their email earlier, don't ask again

WHEN GOING TO BOOKING (only once you have project + country + website + email, all 4):
- In your message, mention the lead's project in their own words and express genuine enthusiasm
- Make them feel the call will be valuable and that the team will be prepared
- Example (personalize it with the real project, do NOT copy this): "Perfect Sarah! I have everything Walo needs about your clothing e-commerce 🙌 He'll be well prepared for the call — I'll show you the available times in a moment."
- Do NOT include the time slots in your message — the system sends them automatically

PORTFOLIO (mention organically — once max, only on a very clear match):
- First figure out if the lead's business is a SERVICE (doesn't sell products — e.g. moving/hauling, consulting, notary, plaster/construction trades) or a PRODUCT/STORE (sells something with a catalog — e.g. auto parts, clothing, supplies). Pick an example from the SAME category — never show a store to someone offering a service, or vice versa, even if you don't have a perfect match for their exact industry

Services:
- Castro Yeso: one-page landing (NO catalog or store) → https://www.globalalora.com/es/casos-de-exito/castro-yeso
- Escribanía Jalil: website for a notary/legal services firm → https://www.globalalora.com/es/casos-de-exito/escribania-jalil
- ALKEMIA: bilingual institutional website → https://www.globalalora.com/es/casos-de-exito/alkemia

Products / stores:
- Autodux: car marketplace for dealers → https://www.globalalora.com/es/casos-de-exito/autodux
- Distri-Sal: e-commerce with real-time stock sync → https://www.globalalora.com/es/casos-de-exito/distrisal
- Voutier: auto parts store with filterable catalog → https://www.globalalora.com/es/casos-de-exito/voutier
- Mimi Kids: artisan e-commerce with MercadoPago → https://www.globalalora.com/es/casos-de-exito/mimikids

Other:
- Soy LIDIA: WhatsApp bot for clinics (24/7 booking) → https://www.globalalora.com/es/casos-de-exito/soy-lidia
- ALORA CRM: lead/sales management system (ONLY if client needs internal business management) → https://www.globalalora.com/es/casos-de-exito/alora-crm

- If asked specifically about Google Ads campaign case studies: "We don't have Ads campaign case studies to show you, but every website we build is ready to run Google Ads on top without any issue 🙂" — you can then show a portfolio case from the matching category (service or store), making clear it's a website example, not an ads campaign

GO TO BOOKING: when you have project description + country + website + email — all 4, no exceptions. Never go to booking without the email.
GO TO STOP: if the lead clearly doesn't want to continue. Respond warmly before stopping.`

// Structured output tool — replaces fragile SEND/UPDATE/NEXT text parsing.
// Sonnet 5 fills this JSON directly; we read toolUse.input with zero string splitting.
const QUALIFYING_TOOL: Anthropic.Tool = {
  name: 'responder',
  description: 'Generá la próxima respuesta de Lidia para este lead de WhatsApp',
  input_schema: {
    type: 'object' as const,
    required: ['mensaje', 'siguiente'],
    properties: {
      mensaje: {
        type: 'string',
        description: 'El mensaje exacto que Lidia envía. Texto plano, podés usar *negrita*. Máximo 3-4 líneas.',
      },
      actualizaciones: {
        type: 'object',
        description: 'Datos nuevos del lead extraídos del último mensaje. Solo incluí campos con info nueva y explícita. Omití campos sin información nueva.',
        properties: {
          consulta_detallada: { type: 'string', description: 'Descripción sintetizada del proyecto (podés sintetizar de toda la conversación)' },
          email:    { type: 'string', description: 'Email del lead' },
          empresa:  { type: 'string', description: 'Nombre del negocio o empresa' },
          sitio_web: { type: 'string', description: 'URL del sitio web actual. Si el lead dijo que no tiene sitio web, guardá "No tiene" — no dejes el campo sin reportar, es un dato esencial que ya preguntaste y respondió.' },
          pais:     { type: 'string', description: 'País desde donde escribe el lead' },
          servicios_interesados: {
            type: 'array',
            items: { type: 'string' },
            description: 'Servicios de Alora en los que mostró interés explícito',
          },
        },
        additionalProperties: false,
      },
      siguiente: {
        type: 'string',
        enum: ['CONTINUE', 'BOOKING', 'STOP'],
        description: 'CONTINUE: seguir conversando | BOOKING: ya tenés descripción+país+email, ir a agendar | STOP: el lead no quiere continuar',
      },
    },
  },
}

/**
 * AI-powered qualifying conversation. Replaces the rigid field-by-field state
 * machine after the lead's name is known. Haiku reads the full conversation
 * history, generates Lidia's next message, extracts any new lead data, and
 * decides when to proceed to booking.
 */
async function advanceQualifyingBotWithAI(
  admin: AdminClient,
  {
    leadId,
    conversationId,
    phone,
    text,
    lang,
  }: {
    leadId: string
    conversationId: string
    phone: string
    text: string | null
    lang: Lang
  },
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[Bot AI] No ANTHROPIC_API_KEY')
    return
  }

  const trimmed = text?.trim() ?? ''

  if (!trimmed) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? "I can't listen to audios or read files 😊 Could you write your answer in text?"
        : 'No puedo escuchar audios ni leer archivos 😊 ¿Me podés escribir tu respuesta por texto?',
    })
    return
  }

  // Note: disengagement is handled by the LLM via NEXT: STOP — no fast-path check
  // here because broad regex like "por ahora no" causes false positives on phrases
  // like "por ahora no tenemos nada decidido pero queremos explorar".

  if (JOB_INQUIRY_RE.test(trimmed)) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? "Thanks so much for your interest in joining Alora! 🙂 We're not currently looking to hire. Best of luck!"
        : '¡Muchas gracias por tu interés en ser parte del equipo de Alora! 🙂 Por el momento no estamos incorporando personal. ¡Te deseamos mucho éxito!',
    })
    await admin.from('leads').update({ estado_pipeline: 'no_cualificado' }).eq('id', leadId)
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    return
  }

  const [{ data: lead }, { data: messages }] = await Promise.all([
    admin.from('leads')
      .select('nombre, email, empresa, sitio_web, pais, servicios_interesados, consulta_detallada')
      .eq('id', leadId)
      .single(),
    admin.from('wa_messages')
      .select('direction, body')
      .eq('conversation_id', conversationId)
      .not('body', 'is', null)
      .order('created_at', { ascending: true })
      .limit(30),
  ])

  if (!lead || !messages?.length) return

  // Build alternating user/assistant history, merging consecutive same-role messages
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const msg of messages) {
    if (!msg.body) continue
    const role: 'user' | 'assistant' = msg.direction === 'inbound' ? 'user' : 'assistant'
    const last = history[history.length - 1]
    if (last && last.role === role) {
      last.content += '\n' + msg.body
    } else {
      history.push({ role, content: msg.body })
    }
  }

  if (!history.length || history[history.length - 1].role !== 'user') return

  const ctx: string[] = [`Nombre: ${lead.nombre ?? 'no recopilado'}`]
  if (lead.consulta_detallada) ctx.push(`Proyecto: ${lead.consulta_detallada}`)
  if (lead.servicios_interesados?.length) ctx.push(`Servicios: ${lead.servicios_interesados.join(', ')}`)
  if (lead.email) ctx.push(`Email: ${lead.email}`)
  if (lead.empresa) ctx.push(`Empresa: ${lead.empresa}`)
  if (lead.sitio_web) ctx.push(`Sitio web: ${lead.sitio_web}`)
  if (lead.pais) ctx.push(`País: ${lead.pais}`)

  const systemBase = lang === 'en' ? QUALIFYING_AI_SYSTEM_EN : QUALIFYING_AI_SYSTEM_ES

  try {
    const client = new Anthropic({ apiKey })
    const result = await client.messages.create({
      model: ANTHROPIC_MODEL_QUALIFYING,
      max_tokens: 800,
      system: [
        { type: 'text', text: systemBase, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `\n\nINFO ACTUAL DEL LEAD:\n${ctx.join('\n')}` },
      ],
      tools: [QUALIFYING_TOOL],
      tool_choice: { type: 'tool', name: 'responder' },
      messages: history,
    })

    const toolUse = result.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No tool_use block in qualifying response')

    const { mensaje, actualizaciones, siguiente } = toolUse.input as {
      mensaje: string
      actualizaciones?: Record<string, unknown>
      siguiente: 'CONTINUE' | 'BOOKING' | 'STOP'
    }

    console.log(`[Bot AI] lead ${leadId}: ${siguiente} — ${mensaje.slice(0, 120)}`)

    if (actualizaciones && Object.keys(actualizaciones).length > 0) {
      const ALLOWED = ['consulta_detallada', 'servicios_interesados', 'email', 'empresa', 'sitio_web', 'pais'] as const
      const toSave: Record<string, unknown> = {}
      for (const key of ALLOWED) {
        if (key in actualizaciones && actualizaciones[key] !== null && actualizaciones[key] !== '') {
          toSave[key] = actualizaciones[key]
        }
      }
      if (Object.keys(toSave).length) await admin.from('leads').update(toSave).eq('id', leadId)
    }

    if (siguiente === 'STOP') {
      if (mensaje) await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: mensaje })
      await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
      return
    }

    if (siguiente === 'BOOKING') {
      if (mensaje) await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: mensaje })
      await startBookingFlow(admin, { leadId, conversationId, phone }, 0, undefined, lang)
      return
    }

    if (mensaje) await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: mensaje })
  } catch (err) {
    console.error('[Bot AI] qualifying failed:', err instanceof Error ? err.message : String(err))
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? "Sorry, something went wrong on our end 😊 Could you repeat what you just said?"
        : '¡Disculpá! Algo falló de nuestro lado 😊 ¿Me repetís lo que decías?',
    })
  }
}

/**
 * Figures out which qualifying question (if any) to ask next and sends it.
 * Whether to show the welcome / how far along we are is driven entirely by
 * `bot_next_question` — not by whether the lead is new — so resetting a
 * conversation (bot_next_question cleared back to null) always restarts
 * cleanly with the welcome message.
 */
async function advanceQualifyingBot(
  admin: AdminClient,
  { leadId, conversationId, phone, text, botNextQuestion, lang }: {
    leadId: string
    conversationId: string
    phone: string
    text: string | null
    botNextQuestion: string | null
    lang: Lang
  },
): Promise<void> {
  // A "<field>__retry" sentinel means we already pushed back once on that
  // field and are now looking at the second attempt — accept it no matter what.
  const isRetry = !!botNextQuestion?.endsWith('__retry')
  const askedField = isRetry
    ? (botNextQuestion!.slice(0, -'__retry'.length) as QuestionField)
    : (botNextQuestion as QuestionField | null)

  const trimmed = text?.trim() || ''

  // If no readable text arrived (audio, document, image) and we're mid-qualifying,
  // tell the lead we can't read/listen and stay on the same question.
  if (!trimmed && askedField) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? "I can't listen to audios or read files 😊 Could you write your answer in text?"
        : 'No puedo escuchar audios ni leer archivos 😊 ¿Me podés escribir tu respuesta por texto?',
    })
    return
  }

  // Pure greeting mid-conversation (hola, hi, hey, buenas…) — never accept as a field answer.
  // Re-ask the current question with a friendly greeting prefix.
  const GREETING_RE = /^[¡¿]?\s*(hola|holi|holis|hi|hey|hello|buenas?|buenos\s+d[ií]as?|buen\s+d[ií]a|buenas\s+tardes?|buenas\s+noches?|qu[eé]\s+tal|c[oó]mo\s+and[aá]s?|buen[a]?s)[!.?\s]*$/i
  const isJustGreeting = !!trimmed && GREETING_RE.test(trimmed)
  if (isJustGreeting && askedField) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? `Hi there! 😊 ${getQuestionText(askedField, lang)}`
        : `¡Hola! 😊 ${getQuestionText(askedField, lang)}`,
    })
    return
  }

  // If the lead is asking to switch languages, acknowledge and re-ask the current question
  // in the new language. Don't save this message as a field answer.
  const isLangSwitch = trimmed && (
    /\b(en espa[nñ]ol|hablame en espa[nñ]ol|hablemos en espa[nñ]ol|por favor en espa[nñ]ol|prefiero espa[nñ]ol|en castellano)\b/i.test(trimmed) ||
    /\b(in english|speak english|please in english|respond in english|english please|prefer english)\b/i.test(trimmed)
  )
  if (isLangSwitch && askedField) {
    const ack = lang === 'es' ? '¡Claro, continuamos en español! 😊' : 'Of course, switching to English! 😊'
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: `${ack}\n\n${getQuestionText(askedField, lang)}`,
    })
    // Reset retry sentinel if we were on one, so the validator runs fresh
    if (isRetry) {
      await admin.from('whatsapp_conversations').update({ bot_next_question: askedField }).eq('id', conversationId)
    }
    return
  }

  // If the lead is saying goodbye or postponing, respond warmly and stop qualifying.
  if (trimmed && (DISENGAGEMENT_RE.test(trimmed) || DISENGAGEMENT_RE_EN.test(trimmed))) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? "Understood, no problem! Sorry we couldn't help right now. Whenever you're ready to pick things back up, just write to us — we'll be here 💛 Best of luck!"
        : '¡Entendido, sin problema! Lamentamos no poder ayudarte por ahora. Cuando estés listo/a para retomar, escribinos tranquilo — acá vamos a estar 💛 ¡Mucho ánimo!',
    })
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    return
  }

  // If the lead is looking for a job at Alora, redirect politely — they're not a client lead.
  if (trimmed && JOB_INQUIRY_RE.test(trimmed)) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? "Thanks so much for your interest in joining Alora! 🙂 We're not currently looking to hire, but we appreciate you reaching out. Best of luck in your search!"
        : '¡Muchas gracias por tu interés en ser parte del equipo de Alora! 🙂 Por el momento no estamos incorporando personal, pero valoramos mucho tu iniciativa. ¡Te deseamos mucho éxito en tu búsqueda!',
    })
    await admin.from('leads').update({ estado_pipeline: 'no_cualificado' }).eq('id', leadId)
    await admin.from('activities').insert({
      lead_id: leadId, user_id: null, tipo: 'nota',
      descripcion: 'Búsqueda de empleo detectada — marcado como no cualificado.',
      metadata: { job_inquiry: true, text: trimmed.slice(0, 200) },
    })
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    return
  }

  // Detect whether the incoming message is a question (pricing, gratis, FAQ, etc.)
  // We do this early so we can intercept the consulta_detallada field: if the lead
  // answers that question with a question of their own ("¿cuánto cuesta?") we should
  // answer it and re-ask the field instead of saving a question as the consultation.
  const mentionsGratis = !!(trimmed && /\b(gratis|gratuito|gratuita|gratuitos|gratuitas|sin costo|sin cobrar|de onda|free)\b/i.test(trimmed))
  // "presupuesto" is intentionally excluded: "necesitamos un presupuesto para X" is a
  // project description, not a price question. Pricing keywords must actually ask the price.
  const asksPricing    = !!(trimmed && /\b(costo|costos|precio|precios|cuánto sale|cuanto sale|cuánto cuesta|cuanto cuesta|cuánto cobran|cuanto cobran|tiene costo|tienen costo|es pago|cobran|tarifas?)\b/i.test(trimmed))
  const looksLikeQuestion = !!(trimmed && (
    trimmed.includes('?') ||
    /^(qué|que|cómo|como|cuánto|cuanto|cuándo|cuando|tienen|hacen|ofrecen|trabajan|pueden|hay |es posible|me gustaría saber|quisiera saber|quiero saber|me podés|podés decirme|podrian|sos |son |es |está|están|hacen|venden|trabajan|ofrecen|tienen)\b/i.test(trimmed) ||
    /\b(me gustaría saber|quisiera saber|quiero saber|necesito saber|quería saber|queria saber|quería ver si|queria ver si|quería consultar|queria consultar|sos de|son de|es de|trabajan en|son ustedes)\b/i.test(trimmed)
  ))

  // Detect messages clearly unrelated to Alora's services (telecom, retail, etc.)
  // so Lidia clarifies instead of treating it as a valid project consultation.
  const isOffTopic = !!(trimmed && /\b(celular(es)?|smartphone|chip|sim card|plan de datos|roaming|claro|personal|movistar|telecom|sacar (un |el )?celular|contra factura|plan prepago|plan pospago|portabilidad|recarga|minutos|linea (de )?celular)\b/i.test(trimmed))

  // If the lead mentioned something clearly outside Alora's services (telecom, phones, etc.),
  // clarify who we are and ask if there's something digital we can help with.
  if (askedField === 'consulta_detallada' && !isRetry && trimmed && isOffTopic) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? "There might be a small mix-up 😊 We're *Alora*, a digital technology agency — we build websites, apps, social media, branding, and digital marketing. We're not a phone company or phone retailer.\n\nIs there anything related to technology or your digital presence we can help with?"
        : 'Parece que puede haber una confusión 😊 Nosotros somos *Alora*, una agencia de tecnología digital — desarrollamos sitios web, apps, redes sociales, branding y marketing digital. No somos una empresa de telefonía ni vendemos celulares.\n\n¿Hay algo relacionado con tecnología o presencia digital en lo que te podamos ayudar?',
    })
    await admin.from('whatsapp_conversations').update({ bot_next_question: 'consulta_detallada__retry' }).eq('id', conversationId)
    return
  }

  // If the lead answered consulta_detallada with a question (not an actual description
  // of their need), answer the question and re-ask consulta_detallada. Don't save it.
  if (askedField === 'consulta_detallada' && !isRetry && trimmed && (mentionsGratis || asksPricing || looksLikeQuestion)) {
    let questionAnswer = ''
    if (mentionsGratis) {
      questionAnswer = lang === 'en'
        ? "Just so you know, at Alora we're a fully professional team and all our services are paid 🙂 In the call with Walo you'll chat about what you need and what it would cost."
        : 'Te cuento que en Alora somos un equipo 100% profesional y todos nuestros servicios tienen un costo 🙂 En la llamada con Walo van a charlar sobre qué necesitás y cuánto implicaría.'
    } else if (asksPricing) {
      questionAnswer = lang === 'en'
        ? "Great question! Costs depend on the project — you and Walo will figure out the best solution and what it would cost together 🙂"
        : '¡Buena pregunta! Los costos dependen del proyecto, así que en la llamada con Walo van a ver juntos qué solución se adapta mejor y cuánto implicaría 🙂'
    } else {
      const faqResult = await matchFaqOrEscalate(admin, trimmed)
      if (faqResult.action === 'answer' && faqResult.answer) {
        questionAnswer = faqResult.answer
      }
    }
    const consultaQ = getQuestionText('consulta_detallada', lang)
    const body = questionAnswer
      ? `${questionAnswer}\n\n${consultaQ.charAt(0).toLowerCase()}${consultaQ.slice(1)}`
      : getPushback('consulta_detallada', lang)
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body })
    await admin.from('whatsapp_conversations').update({ bot_next_question: 'consulta_detallada__retry' }).eq('id', conversationId)
    return
  }

  // If the lead sends a raw URL or says "paso un link" instead of describing their project,
  // save the URL as sitio_web (when applicable) and explain that Alora always needs
  // a brief description before quoting — even when they send a link.
  const isPureUrl = /^https?:\/\/\S+$/i.test(trimmed ?? '')
  const isLinkDeflection = /\b(paso\s+(un\s+)?link|mando\s+(el\s+|un\s+)?link|te\s+mando\s+(el\s+)?link|no\s+tendr[eé]\s+que\s+explicar|no\s+hace\s+falta\s+explicar)\b/i.test(trimmed ?? '')
  if (askedField === 'consulta_detallada' && trimmed && (isPureUrl || isLinkDeflection)) {
    if (isPureUrl) {
      await admin.from('leads').update({ sitio_web: trimmed }).eq('id', leadId)
    }
    const body = isPureUrl
      ? (lang === 'en'
        ? "Thanks, I'll pass the link to Walo! 😊 I still need you to tell me briefly what you're looking for — redesign, new features, marketing...?"
        : '¡Genial, ya anoto el link para Walo! 😊 Igual necesito que me cuentes brevemente qué necesitás: ¿rediseño, funcionalidades nuevas, algo de marketing...?')
      : (lang === 'en'
        ? "Sounds great! To make the call with Walo as useful as possible, I need a quick description from you: what do you need or want to build? 😊"
        : 'Entiendo 😊 Para preparar bien la llamada con Walo, igual necesito que me cuentes brevemente qué necesitás — ¿qué querés hacer o mejorar?')
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body })
    await admin.from('whatsapp_conversations').update({ bot_next_question: 'consulta_detallada' }).eq('id', conversationId)
    return
  }

  // Push back once on a non-answer to a validated field instead of silently
  // moving on (e.g. "no tengo" to the email question).
  const validator = askedField ? VALIDATORS[askedField] : undefined
  if (validator && trimmed && !validator.isValid(trimmed) && !isRetry) {
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: getPushback(askedField!, lang) })
    await admin
      .from('whatsapp_conversations')
      .update({ bot_next_question: `${askedField}__retry` })
      .eq('id', conversationId)
    return
  }

  // The field we just asked about isn't AI-inferred — save the raw reply
  // directly (if any) before deciding what's next.
  const extractedNombre = askedField === 'nombre' && trimmed
    ? await extractNameWithAI(trimmed)
    : ''

  // Test lead: move to "testing" stage and stop the bot — lead stays visible in CRM.
  if (askedField === 'nombre' && extractedNombre && extractedNombre.toLowerCase() === 'prueba') {
    await admin.from('leads').update({ nombre: 'Prueba', estado_pipeline: 'testing' }).eq('id', leadId)
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    return
  }

  // If AI couldn't extract a name on the first attempt, push back once instead
  // of saving the first word(s) verbatim. This catches non-name answers like
  // "Hace rato estuvimos hablando" that slip past the length-only validator.
  if (askedField === 'nombre' && !isRetry && trimmed && !extractedNombre) {
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: getPushback('nombre', lang) })
    await admin.from('whatsapp_conversations').update({ bot_next_question: 'nombre__retry' }).eq('id', conversationId)
    return
  }

  if (askedField && DIRECT_SAVE_FIELDS.has(askedField) && trimmed) {
    // On retry for nombre: only save if AI could identify a name.
    // If AI returns nothing, skip so we don't overwrite a prior valid name.
    const isNombreRetryNoName = askedField === 'nombre' && isRetry && !extractedNombre
    if (!isNombreRetryNoName) {
      const valueToSave = askedField === 'nombre' ? (extractedNombre || extractName(trimmed)) : trimmed
      await admin.from('leads').update({ [askedField]: valueToSave }).eq('id', leadId)
    }
  }
  // Email is otherwise left to AI enrichment, but save it directly here too
  // when it was the literal answer to the email question — no need to wait.
  if (askedField === 'email' && trimmed && /\S+@\S+\.\S+/.test(trimmed)) {
    await admin.from('leads').update({ email: trimmed }).eq('id', leadId)
  }

  const { data: lead } = await admin
    .from('leads')
    .select('nombre, email, empresa, sitio_web, pais, servicios_interesados, consulta_detallada')
    .eq('id', leadId)
    .single()

  if (!lead) return

  // After collecting the name, hand off to the AI-powered qualifying flow.
  // The AI reads the full conversation history and handles all remaining fields
  // naturally, without rigid field-by-field state machine logic.
  if (askedField === 'nombre') {
    await admin.from('whatsapp_conversations')
      .update({ bot_phase: 'qualifying_ai', bot_next_question: null })
      .eq('id', conversationId)
    await advanceQualifyingBotWithAI(admin, { leadId, conversationId, phone, text, lang })
    return
  }

  // Whatever we last asked counts as "answered" (even with a "no") — resume
  // looking for missing fields right after it, not from the start.
  const lastAskedIdx = askedField ? QUESTION_ORDER.indexOf(askedField) : -1
  const isFreshStart = lastAskedIdx === -1
  const startIdx = isFreshStart ? 0 : lastAskedIdx + 1

  const nextField = QUESTION_ORDER.slice(startIdx).find((f) => !isFieldFilled(lead, f))

  // During qualifying, if the lead asks a question, answer it before the next field.
  // Priority: gratis/free → pricing → general FAQ → no prefix.
  // We never escalate during qualifying — just answer what we can and keep going.
  let questionPrefix = ''
  if (!isFreshStart && trimmed) {
    if (mentionsGratis) {
      questionPrefix = lang === 'en'
        ? "Just so you know, at Alora we're a fully professional team and all our services are paid 🙂 In the call with Walo you'll chat about what you need and what it would cost.\n\n"
        : 'Te cuento que en Alora somos un equipo 100% profesional y todos nuestros servicios tienen un costo 🙂 En la llamada con Walo van a charlar sobre qué necesitás y cuánto implicaría.\n\n'
    } else if (asksPricing) {
      questionPrefix = lang === 'en'
        ? "Great question! Costs depend on the project — you and Walo will figure out the best solution and what it would cost together 🙂\n\n"
        : '¡Buena pregunta! Los costos dependen del proyecto, así que en la llamada con Walo van a ver juntos qué solución se adapta mejor y cuánto implicaría 🙂\n\n'
    } else if (looksLikeQuestion) {
      const faqResult = await matchFaqOrEscalate(admin, trimmed)
      if (faqResult.action === 'answer' && faqResult.answer) {
        questionPrefix = faqResult.answer + '\n\n'
      }
    }
  }

  if (!nextField) {
    // Nothing left to ask — start the booking flow (or fall back to link).
    if (!isFreshStart) {
      if (questionPrefix) {
        await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: questionPrefix.trim() })
      }
      await startBookingFlow(admin, { leadId, conversationId, phone }, 0, undefined, lang)
    } else {
      await admin
        .from('whatsapp_conversations')
        .update({ bot_phase: 'faq', bot_next_question: null })
        .eq('id', conversationId)
    }
    return
  }

  if (isFreshStart) {
    // If there are already outbound messages in this conversation, a human was
    // handling it directly (e.g. from the native WhatsApp app). Don't restart
    // qualifying from scratch — go to FAQ mode so Lidia can answer questions
    // but won't fire the welcome + form again.
    const { count: outboundCount } = await admin
      .from('wa_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('direction', 'outbound')

    if (outboundCount && outboundCount > 0) {
      console.log(`[Bot] Existing outbound messages found (${outboundCount}), skipping welcome — going to FAQ mode`)
      await admin
        .from('whatsapp_conversations')
        .update({ bot_phase: 'faq', bot_next_question: null })
        .eq('id', conversationId)
      return
    }

    // Atomic claim: only one concurrent call wins when bot_next_question is still null.
    // If another call already claimed it, data comes back empty and we bail out.
    const { data: claimed } = await admin
      .from('whatsapp_conversations')
      .update({ bot_next_question: nextField })
      .eq('id', conversationId)
      .is('bot_next_question', null)
      .select('id')

    if (!claimed?.length) return

    await sendOutboundWhatsAppMessage(admin, {
      conversationId,
      leadId,
      phone,
      body: `${getWelcome(lang)}\n\n${getQuestionText(nextField, lang)}`,
    })
    return
  }

  // Acknowledge the previous answer before asking the next question,
  // unless we already have a questionPrefix that starts the message naturally.
  const ack = askedField && trimmed && !questionPrefix
    ? getAcknowledgment(askedField, trimmed, lead.nombre, lang)
    : ''

  const body = [ack, questionPrefix, getQuestionText(nextField, lang)].filter(Boolean).join('\n\n')

  const sent = await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body })

  if (!sent) return

  await admin
    .from('whatsapp_conversations')
    .update({ bot_next_question: nextField })
    .eq('id', conversationId)
}

// Parses natural-language slot references ("el primero", "el de las 9", "quiero el jueves")
// into a 0-based slot index. Returns -1 if the text is too ambiguous to resolve.
async function parseSlotFromNaturalLanguage(text: string, slots: Date[]): Promise<number> {
  if (!text || !slots.length) return -1
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return -1

  const slotList = slots.map((s, i) => {
    const { fecha, hora } = formatSlotAR(s)
    return `${i + 1}. ${fecha} ${hora}`
  }).join('\n')

  try {
    const client = new Anthropic({ apiKey })
    const result = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 5,
      messages: [{
        role: 'user',
        content: `The user is choosing from these time slots:\n${slotList}\n\nThe user wrote: "${text}"\n\nWhich slot number did they pick? Reply with ONLY the number (1-${slots.length}) or 0 if it's genuinely unclear.`,
      }],
    })
    const raw = (result.content[0] as { type: string; text: string }).text?.trim() ?? '0'
    const idx = parseInt(raw, 10) - 1
    return idx >= 0 && idx < slots.length ? idx : -1
  } catch {
    return -1
  }
}

const SLOT_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']

/**
 * Offers calendar slots grouped by day (up to 2 days, 4 slots each: 2 morning + 2 afternoon).
 * skipDays lets subsequent calls skip already-shown days so the lead can see new options.
 * State is encoded in bot_next_question as: booking_slots:::NEXT_SKIP:::ISO1|ISO2|...|ISON
 */
async function startBookingFlow(
  admin: AdminClient,
  { leadId, conversationId, phone }: { leadId: string; conversationId: string; phone: string },
  skipDays = 0,
  customIntro?: string,
  lang: Lang = 'es',
): Promise<void> {
  const days = await getAvailableSlotsByDay(2, skipDays)

  if (!days.length) {
    const sent = await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: getClosingFallback(lang) })
    if (sent) await admin.from('whatsapp_conversations').update({ bot_phase: 'faq', bot_next_question: null }).eq('id', conversationId)
    return
  }

  const allSlots: Date[] = []
  const dayLines: string[] = []

  for (const day of days) {
    dayLines.push(`📅 *${day.dateLabel}*`)
    for (const slot of day.slots) {
      const { hora } = formatSlotAR(slot)
      dayLines.push(`${SLOT_EMOJIS[allSlots.length]} ${hora} hs`)
      allSlots.push(slot)
    }
    dayLines.push('')
  }

  const nextSkip  = skipDays + days.length
  const encoded   = `${nextSkip}:::${allSlots.map(s => s.toISOString()).join('|')}`
  const validNums = allSlots.map((_, i) => `*${i + 1}*`).join(', ')

  const defaultIntro = skipDays === 0
    ? (lang === 'en'
        ? "All set, I have everything! 🎉\n\nTo get started, I'd like to schedule a 30-minute call with Walo so you can chat about what you need.\n\n"
        : '¡Perfecto, ya tengo todo! 🎉\n\nPara arrancar, te propongo agendar una llamada de 30 minutos con Walo para charlar sobre lo que necesitás.\n\n')
    : (lang === 'en' ? "Here are more available times:\n\n" : 'Acá van más horarios disponibles:\n\n')

  const intro = customIntro ?? defaultIntro

  const body = intro
    + dayLines.join('\n').trim()
    + (lang === 'en'
        ? `\n\nReply with the number of the slot that works best for you (${validNums}) 🗓️\nOr if none work, type *"others"* to see more dates.`
        : `\n\nRespondé con el número del horario que más te quede bien (${validNums}) 🗓️\nO si ninguno te sirve, escribí *"otros"* para ver más fechas.`)

  const sentSlots = await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body })
  if (!sentSlots) return
  await admin
    .from('whatsapp_conversations')
    .update({ bot_phase: 'booking', bot_next_question: `${BOOKING_SLOTS_PREFIX}${encoded}` })
    .eq('id', conversationId)
}

/**
 * Tries to find a slot index by matching a natural-language time/day phrase.
 * E.g. "viernes 24 15hs", "el lunes a las 15:30", "15h".
 * Returns -1 if no match found.
 */
function findSlotByDayTime(trimmed: string, slots: Date[]): number {
  // Extract hour and optional minutes from text like "15hs", "15:30hs", "15h30", "15.30"
  const timeRe = /\b(\d{1,2})(?:[:.h](\d{2}))?\s*h(?:s|oras?)?\b/i
  const timeMatch = trimmed.match(timeRe)
  if (!timeMatch) return -1
  const targetHour = parseInt(timeMatch[1], 10)
  const targetMin  = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
  if (targetHour < 0 || targetHour > 23) return -1

  const lower = trimmed.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const DAY_MAP: Record<string, number> = {
    domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  }
  let targetDay: number | null = null
  for (const [name, dayNum] of Object.entries(DAY_MAP)) {
    if (lower.includes(name)) { targetDay = dayNum; break }
  }

  // Date number (1-31) — only take one that isn't the hour itself
  let targetDate: number | null = null
  const dateNums = [...trimmed.matchAll(/\b(\d{1,2})\b/g)]
    .map(m => parseInt(m[1], 10))
    .filter(n => n >= 1 && n <= 31 && n !== targetHour)
  if (dateNums.length > 0) targetDate = dateNums[0]

  for (let i = 0; i < slots.length; i++) {
    const ar = new Date(slots[i].getTime() - 3 * 60 * 60 * 1000) // AR UTC-3
    if (ar.getHours() !== targetHour || ar.getMinutes() !== targetMin) continue
    if (targetDay !== null && ar.getDay() !== targetDay) continue
    if (targetDate !== null && ar.getDate() !== targetDate) continue
    return i
  }
  return -1
}

/**
 * Handles the lead's slot selection or "otros" request.
 * State format in bot_next_question: booking_slots:::NEXT_SKIP:::ISO1|ISO2|...|ISON
 * Legacy format (no NEXT_SKIP segment) is also handled gracefully.
 */
const BOOKING_GREETING_RE = /^[¡¿]?\s*(hola|holi|holis|hi|hey|hello|buenas?|buenos\s+d[ií]as?|buen\s+d[ií]a|buenas\s+tardes?|buenas\s+noches?|qu[eé]\s+tal|c[oó]mo\s+and[aá]s?|buen[a]?s)[!.?\s]*$/i

async function handleBookingPhase(
  admin: AdminClient,
  { leadId, conversationId, phone, text, botNextQuestion, lang }: {
    leadId: string; conversationId: string; phone: string; text: string | null; botNextQuestion: string | null; lastMessageAt: string | null; lang: Lang
  },
): Promise<void> {
  const trimmedEarly = text?.trim() ?? ''

  // Detect disengagement before anything else — same as in qualifying
  if (trimmedEarly && (DISENGAGEMENT_RE.test(trimmedEarly) || DISENGAGEMENT_RE_EN.test(trimmedEarly))) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? "Understood, no problem! Sorry we couldn't help right now. Whenever you're ready to pick things back up, just write to us — we'll be here 💛 Best of luck!"
        : '¡Entendido, sin problema! Lamentamos no poder ayudarte por ahora. Cuando estés listo/a para retomar, escribinos tranquilo — acá vamos a estar 💛 ¡Mucho ánimo!',
    })
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    return
  }

  if (botNextQuestion?.startsWith(BOOKING_CONFIRM_PREFIX)) {
    await handleBookingConfirmation(admin, { leadId, conversationId, phone, text, botNextQuestion, lang })
    return
  }

  if (!botNextQuestion?.startsWith(BOOKING_SLOTS_PREFIX)) {
    await admin.from('whatsapp_conversations').update({ bot_phase: 'faq', bot_next_question: null }).eq('id', conversationId)
    return
  }

  const raw = botNextQuestion.slice(BOOKING_SLOTS_PREFIX.length)

  // New format: "NEXT_SKIP:::ISO1|ISO2|..." — legacy format starts with a date char
  let nextSkip = 0
  let slotsStr = raw
  if (/^\d+:::/.test(raw)) {
    const sep = raw.indexOf(':::')
    nextSkip = parseInt(raw.slice(0, sep), 10) || 0
    slotsStr = raw.slice(sep + 3)
  }

  const slots = slotsStr.split('|').filter(Boolean).map(s => new Date(s))
  const trimmed = text?.trim() ?? ''

  // Re-engage warmly when stored slots are expired OR lead returns after 6+ hours with a greeting.
  // We query the last OUTBOUND message time directly — convo.last_message_at is updated to "now"
  // by the inbound webhook before runBot reads it, so it cannot reliably measure absence.
  const now = new Date()
  const allSlotsExpired = slots.length > 0 && slots.every(s => s <= now)
  const isGreeting = trimmedEarly ? BOOKING_GREETING_RE.test(trimmedEarly) : false

  if (allSlotsExpired || isGreeting) {
    let shouldReEngage = allSlotsExpired
    if (!shouldReEngage) {
      const { data: lastOut } = await admin
        .from('wa_messages')
        .select('created_at')
        .eq('conversation_id', conversationId)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (lastOut?.created_at) {
        const hoursSince = (Date.now() - new Date(lastOut.created_at).getTime()) / 3_600_000
        shouldReEngage = hoursSince >= 6
      }
    }
    if (shouldReEngage) {
      const { data: lead } = await admin.from('leads').select('nombre').eq('id', leadId).single()
      const firstName = (lead?.nombre ?? '').trim().split(/\s+/)[0] ?? ''
      const intro = lang === 'en'
        ? `Hey${firstName ? ` ${firstName}` : ''}! 😊 Good to have you back. Here are the available times for the call with Walo:\n\n`
        : `¡Hola${firstName ? ` ${firstName}` : ''}! 😊 ¡Qué bueno que volviste! Te muestro los horarios disponibles para la llamada con Walo:\n\n`
      await startBookingFlow(admin, { leadId, conversationId, phone }, 0, intro, lang)
      return
    }
  }

  // Lead wants to see different dates
  const wantsOthers = /^(otro|otros|ninguno|ninguna|no puedo|no me|no sirve|más|mas|ver más|ver mas|otras fechas)/i.test(trimmed)
    || /\b(otro|otros|ninguno|más (fecha|horario|dia|opcion)|otra fecha)\b/i.test(trimmed)
    || /^(other|others|none|can't make|doesn't work|more options|see more|other dates)/i.test(trimmed)
    || /\b(other time|other slot|other date|more times|more dates|different time)\b/i.test(trimmed)

  if (wantsOthers) {
    await startBookingFlow(admin, { leadId, conversationId, phone }, nextSkip, undefined, lang)
    return
  }

  // Lead is expressing a specific time (e.g. "22:00", "10 de la noche", "24 horas")
  // that likely doesn't match any available slot — explain and re-offer
  const expressesOutOfHoursTime =
    /\b(\d{1,2})[:.]\d{2}\b/.test(trimmed) ||
    /\b(noche|madrugada|medianoche|nocturno|de noche|por la noche|a la noche|tarde noche)\b/i.test(trimmed) ||
    /\b(24\s*hora|toda(s)? la(s)? noche|cualquier hora|a las? \d{1,2})\b/i.test(trimmed)

  if (expressesOutOfHoursTime) {
    await startBookingFlow(admin, { leadId, conversationId, phone }, nextSkip,
      lang === 'en'
        ? 'Our calls are scheduled during business hours 🕘 Here are the available times:\n\n'
        : 'Las llamadas son en horario comercial 🕘 Estos son los horarios disponibles:\n\n',
      lang,
    )
    return
  }

  let num = parseInt(trimmed, 10)
  if (isNaN(num)) {
    // Handle "Viernes 24 1" — extract the last standalone number
    const m = trimmed.match(/\b(\d+)\b(?![\s\S]*\b\d+\b)/)
    if (m) num = parseInt(m[1], 10)
  }
  let idx = num - 1

  // If still not a valid slot, try matching by day name and/or time ("viernes 24 15hs")
  if (isNaN(num) || idx < 0 || idx >= slots.length) {
    const textIdx = findSlotByDayTime(trimmed, slots)
    if (textIdx >= 0) idx = textIdx
  }

  // Last resort: ask Haiku to interpret natural language ("el primero", "el de las 9", "quiero el jueves")
  if (isNaN(num) || idx < 0 || idx >= slots.length) {
    const nlIdx = await parseSlotFromNaturalLanguage(trimmed, slots)
    if (nlIdx >= 0) idx = nlIdx
  }

  // Lead is objecting to the call format itself ("sin realizar llamadas", "prefiero por escrito")
  if (isNaN(num) || idx < 0 || idx >= slots.length) {
    const wantsNoCall = /\b(sin (realizar|hacer|tener) (una )?llamadas?|sin llamar|por mensaje|por escrito|por chat|por whatsapp|sin hablar (por tel[eé]fono|con nadie))\b/i.test(trimmed)
      || /\b(no (quiero|quisiera|me gustar[ií]a) (hacer|tener|realizar|una)?\s*(llamada|hablar))\b/i.test(trimmed)
      || /\bpref(iero|er[ií]a) (no llamar|no (hacer|tener) llamada|por (escrito|mensaje|chat|whatsapp))\b/i.test(trimmed)
      || /\b(without (a )?call|no call|prefer (email|message|chat|written))\b/i.test(trimmed)

    if (wantsNoCall) {
      await sendOutboundWhatsAppMessage(admin, {
        conversationId, leadId, phone,
        body: lang === 'en'
          ? "Understood! Just so you know, without a prior call we're not able to put together a quote — it's a quick 30-minute video call with Walo to understand your project and make sure we can help you properly 😊 If you'd like to move forward, pick a time below."
          : '¡Entendido! Te cuento que sin una llamada previa no podemos armar un presupuesto — es una videollamada de 30 minutos con Walo para entender bien tu proyecto y asegurarnos de poder ayudarte como corresponde 😊 Si querés avanzar, elegí un horario abajo.',
      })
      await startBookingFlow(admin, { leadId, conversationId, phone }, nextSkip, undefined, lang)
      return
    }
  }

  if (isNaN(num) || idx < 0 || idx >= slots.length) {
    // Portfolio match takes priority — show the case study and re-offer slots
    const bookingPortfolioMatch = await findPortfolioMatch(trimmed)
    const bookingPortfolioMsg   = buildPortfolioMsg(bookingPortfolioMatch, lang)
    if (bookingPortfolioMsg && bookingPortfolioMatch) {
      void admin.from('activities').insert({ lead_id: leadId, user_id: null, tipo: 'nota',
        descripcion: `[portfolio-match] Lidia mostró caso "${bookingPortfolioMatch.name}" en fase booking.`,
        metadata: { portfolio_case: bookingPortfolioMatch.name, phase: 'booking', text: trimmed.slice(0, 200) },
      }).then(undefined, () => {})
      await startBookingFlow(admin, { leadId, conversationId, phone }, 0,
        lang === 'en'
          ? `${bookingPortfolioMsg}\n\nMeanwhile, let's lock in that call with Walo so you can see what we could build for you 😊 Pick the time that works best:\n\n`
          : `${bookingPortfolioMsg}\n\nMientras tanto, agendemos esa llamada con Walo para que vean juntos qué podemos hacer para vos 😊 Elegí el horario que más te quede:\n\n`,
        lang,
      )
      return
    }

    // Detect if the lead asked a question instead of picking a slot
    const mentionsGratisB = /\b(gratis|gratuito|gratuita|sin costo|sin cobrar|free)\b/i.test(trimmed)
    const asksPricingB    = /\b(costo|costos|precio|precios|cuánto sale|cuanto sale|cuánto cuesta|cuanto cuesta|cuánto cobran|cuanto cobran|a cuanto|a cuánto|tiene costo|tienen costo|es pago|cobran|tarifas?|how much|what does it cost|pricing|price|quote|rates?)\b/i.test(trimmed)
    const looksLikeQuestionB =
      trimmed.includes('?') ||
      /^(qué|que|cómo|como|cuánto|cuanto|cuándo|cuando|tienen|hacen|ofrecen|trabajan|pueden|hay |es posible|me gustaría saber|quisiera saber|quiero saber|what|how|when|do you|can you)\b/i.test(trimmed) ||
      /\b(me gustaría saber|quisiera saber|quiero saber|necesito saber|I want to know|I'd like to know|could you tell me)\b/i.test(trimmed)

    let questionAnswer = ''
    if (mentionsGratisB) {
      questionAnswer = lang === 'en'
        ? "Just so you know, at Alora we're a fully professional team and all our services are paid 🙂 In the call with Walo you'll chat about what you need and the pricing."
        : 'Te cuento que en Alora somos un equipo 100% profesional y todos nuestros servicios son pagos 🙂 En la llamada con Walo van a charlar sobre lo que necesitás y los valores.'
    } else if (asksPricingB) {
      questionAnswer = lang === 'en'
        ? "Great question! Costs depend on the project — you and Walo will figure out the best solution and pricing together in the call 🙂"
        : '¡Buena pregunta! Los costos dependen del proyecto — en la llamada con Walo van a ver juntos qué solución se adapta mejor y cuánto implicaría 🙂'
    } else if (looksLikeQuestionB) {
      const faqResult = await matchFaqOrEscalate(admin, trimmed)
      if (faqResult.action === 'answer' && faqResult.answer) {
        questionAnswer = faqResult.answer
      }
    }

    // If they asked a question, answer it first and then re-offer slots conversationally
    if (questionAnswer) {
      await startBookingFlow(admin, { leadId, conversationId, phone }, 0,
        lang === 'en'
          ? `${questionAnswer}\n\nWith that said, I'd like to schedule a 30-min call with Walo so you can chat about your project 😊 Pick the time that works best for you:\n\n`
          : `${questionAnswer}\n\nDicho eso, te propongo agendar una llamada de 30 min con Walo para que charlen tranquilos sobre tu proyecto 😊 Elegí el horario que más te quede bien:\n\n`,
        lang,
      )
    } else {
      // Detect confusion — re-show full slot list with clearer instructions
      const isConfused =
        /\b(no entiendo|no comprendo|no sé qué|no se que|que numero|qué número|cual numero|cuál número|cómo elijo|como elijo|no me queda claro|no entend)\b/i.test(trimmed) ||
        /^(no entiendo|que numero|cual numero|como hago|no se|no sé)\b/i.test(trimmed)

      if (isConfused) {
        await startBookingFlow(admin, { leadId, conversationId, phone }, nextSkip,
          lang === 'en'
            ? 'No worries! 😊 It\'s simple: just reply with the *number* next to the time that works best for you (for example, reply *1* to pick the first option):\n\n'
            : '¡No hay problema! 😊 Es simple: respondé con el *número* que está al lado del horario que te quede bien (por ejemplo, respondé *1* para elegir la primera opción):\n\n',
          lang,
        )
        return
      }

      // Count consecutive failed nudges by checking recent outbound messages
      const { data: recentOut } = await admin
        .from('wa_messages')
        .select('body')
        .eq('conversation_id', conversationId)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(5)

      const NUDGE_ES = 'Respondé con el número del horario'
      const NUDGE_EN = 'Just reply with the number'
      const consecutiveNudges = (recentOut ?? []).filter(m =>
        m.body?.includes(NUDGE_ES) || m.body?.includes(NUDGE_EN)
      ).length

      if (consecutiveNudges >= 3) {
        // Too many failed attempts — re-show full slot list with extra explanation
        await startBookingFlow(admin, { leadId, conversationId, phone }, nextSkip,
          lang === 'en'
            ? 'Let me show you the options again 😊 Reply with the *number* (1, 2, 3…) of the time that works for you, or write *others* to see different dates:\n\n'
            : 'Te muestro los horarios de nuevo 😊 Respondé con el *número* (1, 2, 3…) del horario que te quede bien, o escribí *otros* para ver otras fechas:\n\n',
          lang,
        )
      } else {
        // Simple nudge
        await sendOutboundWhatsAppMessage(admin, {
          conversationId, leadId, phone,
          body: lang === 'en'
            ? 'Just reply with the number of the time that works best for you 😊 (or write *others* to see different options)'
            : 'Respondé con el número del horario que más te quede bien 😊 (o escribí *otros* para ver opciones diferentes)',
        })
      }
    }
    return
  }

  const slot = slots[idx]
  const { hora } = formatSlotAR(slot)

  const daysFull   = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const monthsFull = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const ar = new Date(slot.getTime() - 3 * 60 * 60 * 1000)
  const fullLabel = `${daysFull[ar.getDay()]} ${ar.getDate()} de ${monthsFull[ar.getMonth()]} a las ${hora} hs`

  const confirmState = `${BOOKING_CONFIRM_PREFIX}${slot.toISOString()}:::${nextSkip}:::${slotsStr}:::0`
  const sentQ = await sendOutboundWhatsAppMessage(admin, {
    conversationId, leadId, phone,
    body: lang === 'en'
      ? `You chose *${fullLabel}* 🗓️\n\nShall we confirm that time? Reply *Yes* to book it, or *Others* to see other options.`
      : `Elegiste el *${fullLabel}* 🗓️\n\n¿Confirmamos esa fecha? Respondé *Sí* para agendar, o *Otros* para ver otros horarios.`,
  })
  if (!sentQ) return
  await admin.from('whatsapp_conversations').update({ bot_next_question: confirmState }).eq('id', conversationId)
}

async function bookConfirmedSlot(
  admin: AdminClient,
  { leadId, conversationId, phone, slot, lang }: { leadId: string; conversationId: string; phone: string; slot: Date; lang: Lang },
): Promise<void> {
  const { fecha, hora } = formatSlotAR(slot)

  const { data: lead } = await admin
    .from('leads')
    .select('nombre, apellido, empresa, email')
    .eq('id', leadId)
    .single()

  if (!lead) return

  try {
    const result = await createCalendarEvent({
      leadId,
      nombre:            lead.nombre ?? 'Lead',
      apellido:          lead.apellido ?? null,
      empresa:           lead.empresa ?? null,
      email:             lead.email ?? null,
      fecha_reunion:     fecha,
      reunion_hora:      hora,
      reunion_link:      null,
      responsable_email: process.env.GOOGLE_CALENDAR_SUBJECT ?? null,
    })

    // Build follow-up date: 2 days after the meeting
    const reunionDate  = new Date(`${fecha}T${hora}:00-03:00`)
    const followupDate = new Date(reunionDate.getTime() + 2 * 24 * 60 * 60 * 1000)

    await admin.from('leads').update({
      fecha_reunion:       fecha,
      reunion_hora:        hora,
      reunion_link:        result.meetLink ?? result.eventUrl,
      estado_pipeline:     'reunion_reservada',
      fecha_contacto:      new Date().toISOString(),
      fecha_followup:      followupDate.toISOString().slice(0, 10),
      calendar_event_id:   result.eventId,
      calendar_event_url:  result.eventUrl,
    }).eq('id', leadId)

    const daysFull  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    const monthsFull = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const ar = new Date(slot.getTime() - 3 * 60 * 60 * 1000)
    const fullLabel = `${daysFull[ar.getDay()]} ${ar.getDate()} de ${monthsFull[ar.getMonth()]} a las ${hora} hs`

    const meetLink = result.meetLink ?? result.eventUrl ?? null
    const confirmation = lang === 'en'
      ? `Meeting confirmed! 🎉\n\n📅 ${fullLabel}\n\n`
        + `Walo will join at that time to chat about what you need 💛\n\n`
        + (meetLink ? `🔗 Meeting link: ${meetLink}\n\n` : '')
        + (lead.email ? `We're sending an invite to ${lead.email} with the meeting details.\n\n` : '')
        + 'If you need to reschedule or have any questions, feel free to write 🙂'
      : `¡Reunión confirmada! 🎉\n\n📅 ${fullLabel}\n\n`
        + `Walo se va a conectar en ese horario para charlar sobre lo que necesitás 💛\n\n`
        + (meetLink ? `🔗 Link de la reunión: ${meetLink}\n\n` : '')
        + (lead.email ? `Te mandamos una invitación a ${lead.email} con el detalle de la reunión.\n\n` : '')
        + 'Si necesitás cambiar el horario o tenés alguna duda, escribime tranquilo 🙂'

    const sentConf = await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: confirmation })
    if (sentConf) await admin.from('whatsapp_conversations').update({ bot_phase: 'faq', bot_next_question: null }).eq('id', conversationId)

    // Push notification to the team
    notifyAll({
      title: `📅 Reunión agendada — ${[lead.nombre, lead.apellido].filter(Boolean).join(' ')}`,
      body:  fullLabel,
      url:   `/leads/${leadId}`,
    }).catch(() => {})

    // Send emails (best-effort — don't fail the booking if email sending fails)
    const leadName = [lead.nombre, lead.apellido].filter(Boolean).join(' ') || 'Lead'
    const calendarUrl = result.eventUrl

    // Alora brand colors
    const BRAND    = '#1B4040'   // dark teal (primary)
    const BRAND_BG = '#EEF4F4'   // very light teal (background)
    const BRAND_LT = '#E0EEEE'   // light teal (accent strip)

    // Internal notification to the team (awaited so Vercel doesn't kill it before it sends)
    try { await sendGmail({
      from:    'info@globalalora.com',
      to:      'somosglobalalora@gmail.com',
      subject: `📅 Nueva reunión agendada — ${leadName} (${fullLabel})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:${BRAND_BG};padding:32px;border-radius:12px">
          <div style="background:${BRAND};border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
            <img src="https://globalalora.com/logo-web.png" alt="Alora" style="height:36px;margin-bottom:12px;filter:brightness(0) invert(1)" onerror="this.style.display='none'">
            <h1 style="color:#fff;margin:0;font-size:22px">📅 Nueva reunión agendada</h1>
          </div>
          <div style="background:#fff;border-radius:8px;padding:24px;border:1px solid #d1e0e0">
            <p style="margin:0 0 16px;font-size:15px;color:#374151">
              <strong>${leadName}</strong> agendó una reunión de relevamiento.
            </p>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:120px">Fecha y hora</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px">${fullLabel}</td></tr>
              ${lead.empresa ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Empresa</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px">${lead.empresa}</td></tr>` : ''}
              ${lead.email   ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px">${lead.email}</td></tr>` : ''}
              <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">WhatsApp</td><td style="padding:8px 0;font-weight:600;color:#111827;font-size:13px">+${phone}</td></tr>
            </table>
            <div style="margin-top:20px;text-align:center">
              <a href="${calendarUrl}" style="display:inline-block;background:${BRAND};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver en Google Calendar</a>
            </div>
          </div>
          <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">Alora CRM · Enviado automáticamente por Lidia</p>
        </div>
      `,
    }) } catch (err) { console.error('[Booking] Internal email failed:', err) }

    // Confirmation to the lead (only if they provided email)
    if (lead.email) {
      try { await sendGmail({
        from:    'info@globalalora.com',
        to:      lead.email,
        toName:  leadName,
        subject: `Reunión confirmada con Alora — ${fullLabel}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:${BRAND_BG};padding:32px;border-radius:12px">
            <div style="background:${BRAND};border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
              <img src="https://globalalora.com/logo-web.png" alt="Alora" style="height:40px;margin-bottom:12px;filter:brightness(0) invert(1)" onerror="this.style.display='none'">
              <h1 style="color:#fff;margin:0;font-size:22px">¡Reunión confirmada! 🎉</h1>
            </div>
            <div style="background:#fff;border-radius:8px;padding:24px;border:1px solid #d1e0e0">
              <p style="margin:0 0 16px;font-size:15px;color:#374151">Hola <strong>${lead.nombre ?? 'ahí'}</strong>,</p>
              <p style="margin:0 0 20px;font-size:15px;color:#374151">Tu llamada de relevamiento con el equipo de Alora está confirmada:</p>
              <div style="background:${BRAND_LT};border-left:4px solid ${BRAND};padding:16px;border-radius:0 8px 8px 0;margin-bottom:20px">
                <p style="margin:0;font-size:18px;font-weight:700;color:${BRAND}">📅 ${fullLabel}</p>
              </div>
              <p style="margin:0 0 20px;font-size:14px;color:#6b7280">En breve te llega la invitación de Google Calendar con el link de la videollamada.</p>
              <div style="text-align:center">
                <a href="${calendarUrl}" style="display:inline-block;background:${BRAND};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver en Google Calendar</a>
              </div>
            </div>
            <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">Si necesitás reprogramar, respondé a este email o escribinos por WhatsApp.</p>
          </div>
        `,
      }) } catch (err) { console.error('[Booking] Lead confirmation email failed:', err) }
    }

  } catch (err) {
    console.error('[Booking] Failed to create calendar event:', err)
    // Fall back to external link
    const sentFallback = await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: getClosingFallback(lang) })
    if (sentFallback) await admin.from('whatsapp_conversations').update({ bot_phase: 'faq', bot_next_question: null }).eq('id', conversationId)
  }
}

/**
 * Last-resort fallback when the lead's reply during booking confirmation
 * doesn't match "yes", "change time", an identity question, or an FAQ
 * question. Instead of repeating the same confirmation line verbatim
 * (which reads as an unresponsive loop), re-read the actual recent
 * messages and let Claude write one short, genuinely context-aware reply.
 * Returns '' on any failure so the caller falls back to the bare prompt.
 */
async function generateContextAwareBookingReply(
  admin: AdminClient,
  { conversationId, fullLabel, lang }: { conversationId: string; fullLabel: string; lang: Lang },
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return ''
  try {
    const [{ data: recent }, { data: faqs }] = await Promise.all([
      admin
        .from('wa_messages')
        .select('direction, body')
        .eq('conversation_id', conversationId)
        .not('body', 'is', null)
        .order('created_at', { ascending: false })
        .limit(6),
      admin
        .from('whatsapp_faqs')
        .select('pregunta, respuesta')
        .eq('activo', true)
        .order('orden', { ascending: true }),
    ])
    const transcript = (recent ?? [])
      .reverse()
      .map(m => `${m.direction === 'inbound' ? 'Lead' : 'Lidia'}: ${m.body}`)
      .join('\n')
    // Real FAQ answers the team maintains — this is the same source of
    // truth matchFaqOrEscalate uses, not facts hand-typed into this prompt,
    // so it stays correct as the team edits the FAQ list instead of drifting.
    const faqList = (faqs ?? []).map(f => `P: ${f.pregunta}\nR: ${f.respuesta}`).join('\n\n')

    const client = new Anthropic({ apiKey })
    const result = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: lang === 'en'
          ? `You are Lidia, Alora's WhatsApp receptionist. Your ONLY goal right now is getting this lead to confirm a pending call slot (*${fullLabel}*) — this is not an open-ended chat. This is the SECOND time in a row their reply hasn't been a clear yes or a request for another time — read the recent conversation below and genuinely figure out why.\n\nIMPORTANT: if what they said is a basic factual question, check the team's FAQ list below first and answer using it if it applies (translate to English if needed) — that is not "going off topic", it's normal and expected. Only defer to the call for things that truly need project-specific context, like exact pricing or technical scoping, or that aren't covered by the FAQs. Never say "I'll tell you on the call" for something you can just answer now.\n\nTeam FAQs:\n${faqList || '(none loaded)'}\n\nWrite ONE short (max 2-3 lines) reply, then end by directly asking them to confirm this slot or name another time. If you truly can't tell what they mean, say so plainly and ask them to just reply Yes or Others.\n\nRecent conversation:\n${transcript}\n\nReply with ONLY the message text, no quotes, no explanation.`
          : `Sos Lidia, la recepcionista de Alora por WhatsApp. Tu ÚNICO objetivo ahora mismo es que este lead confirme un horario de llamada pendiente (*${fullLabel}*) — esto no es una charla abierta. Es la SEGUNDA vez seguida que su respuesta no es un "sí" claro ni un pedido de otro horario — leé la conversación reciente de abajo y entendé de verdad por qué.\n\nIMPORTANTE: si lo que dijo es una pregunta básica y factual, revisá primero la lista de FAQs del equipo de abajo y respondé con eso si aplica — eso no es "desviarse del tema", es lo normal y esperable. Solo derivá a la llamada cosas que de verdad necesiten el contexto puntual del proyecto (precio exacto, alcance técnico específico) o que no estén cubiertas por las FAQs. Nunca digas "te lo cuento en la llamada" para algo que podés responder ya mismo.\n\nFAQs del equipo:\n${faqList || '(no hay ninguna cargada)'}\n\nEscribí UNA respuesta corta (máximo 2-3 líneas), y terminá pidiéndole directamente que confirme este horario o te diga otro. Si de verdad no entendés qué quiso decir, decilo con claridad y pedile que responda simplemente Sí u Otros.\n\nConversación reciente:\n${transcript}\n\nRespondé solo con el texto del mensaje, sin comillas ni explicación.`,
      }],
    })
    const out = (result.content[0] as { type: string; text: string }).text?.trim() ?? ''
    return out.length > 0 && out.length < 600 ? out : ''
  } catch (err) {
    console.error('[Bot] generateContextAwareBookingReply failed:', err)
    return ''
  }
}

async function handleBookingConfirmation(
  admin: AdminClient,
  { leadId, conversationId, phone, text, botNextQuestion, lang }: {
    leadId: string; conversationId: string; phone: string; text: string | null; botNextQuestion: string; lang: Lang
  },
): Promise<void> {
  const raw = botNextQuestion.slice(BOOKING_CONFIRM_PREFIX.length)
  // format: SELECTED_ISO:::NEXT_SKIP:::SLOTS_STR:::ATTEMPT (ATTEMPT is new;
  // missing on any state created before this field existed, defaults to 0)
  const parts = raw.split(':::')
  if (parts.length < 2) {
    await admin.from('whatsapp_conversations').update({ bot_phase: 'faq', bot_next_question: null }).eq('id', conversationId)
    return
  }
  const [selectedISO, nextSkipRaw, slotsStr = '', attemptRaw] = parts
  const nextSkip = parseInt(nextSkipRaw, 10) || 0
  const attempt  = parseInt(attemptRaw, 10) || 0

  // .normalize('NFC'): some phone keyboards send accented letters as a
  // combining-mark pair (NFD) instead of one precomposed character — this
  // keeps every regex below working the same regardless of which form the
  // lead's phone sent. (The actual "Sí"-never-confirms bug was `confirmed`
  // below relying on \b, see its comment.)
  const trimmed = (text?.trim() ?? '').normalize('NFC')

  if (trimmed && (DISENGAGEMENT_RE.test(trimmed) || DISENGAGEMENT_RE_EN.test(trimmed))) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? "Understood, no worries! Whenever you want to pick it back up, just write to us 💛"
        : '¡Entendido, sin problema! Cuando quieras retomar, escribime tranquilo 💛',
    })
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    return
  }

  const wantsChange = /^(no\b|otros|cambiar|otro|otra|diferente|ver m[aá]s|quiero otro|ninguno)\b/i.test(trimmed)
    || /\b(otro horario|otra fecha|cambiar horario|cambiar fecha|otros horarios|m[aá]s opciones)\b/i.test(trimmed)
    || /^(no\b|others|change|different|see more|other options)\b/i.test(trimmed)
    || /\b(other time|other slot|other date|different time|change the time)\b/i.test(trimmed)

  if (wantsChange) {
    await startBookingFlow(admin, { leadId, conversationId, phone }, nextSkip, undefined, lang)
    return
  }

  // (?!\p{L}) instead of \b: JS's \b treats \w as ASCII-only, so it never
  // counted "í" as a word character — plain "Sí" (the normal way anyone
  // writes it) matched nothing here and always fell to the "not confirmed"
  // branch below, re-asking the same question forever no matter how many
  // times the lead answered. The Unicode-aware lookahead fixes that for
  // "sí" specifically; every other word in the list already ended in an
  // ASCII letter and was unaffected.
  const confirmed = /^(s[ií]i*|dale|confirmo|confirmado|ok|listo|perfecto|va|b[aá]rbaro|de una|buen[ií]simo|claro|genial|excelente|re bien|yes|yep|yeah|confirmed|confirm|sounds good|sure|great|perfect|absolutely|definitely)(?!\p{L})/iu.test(trimmed)

  if (!confirmed) {
    const slot = new Date(selectedISO)
    const { hora } = formatSlotAR(slot)
    const daysFull   = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    const monthsFull = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const ar = new Date(slot.getTime() - 3 * 60 * 60 * 1000)
    const fullLabel = `${daysFull[ar.getDay()]} ${ar.getDate()} de ${monthsFull[ar.getMonth()]} a las ${hora} hs`
    const confirmLine = lang === 'en'
      ? `To confirm *${fullLabel}*, reply *Yes* — or if you'd prefer another time, type *Others* 🙂`
      : `Para confirmar el *${fullLabel}*, respondé *Sí* — o si preferís otro horario, escribí *Otros* 🙂`

    // The lead asked something instead of confirming — this used to just
    // repeat confirmLine verbatim no matter what they said (even "¿quién
    // sos?" or "por qué tenés mi número?"), which reads as an unresponsive
    // loop. Identity/FAQ questions get a direct answer + the prompt again —
    // these are real, useful exchanges, not the lead being "stuck", so they
    // don't count against the attempt ladder below.
    const asksIdentity = /\b(qui[eé]n\s+(sos|eres|habla|es)|con\s+qui[eé]n\s+hablo|qu[eé]\s+es\s+esto|por\s+qu[eé]\s+ten[eé]s\s+mi\s+n[uú]mero|de\s+d[oó]nde\s+sacaste\s+mi\s+n[uú]mero|c[oó]mo\s+consegu[ií]ste\s+mi\s+n[uú]mero|who\s+(are\s+you|is\s+this)|why\s+do\s+you\s+have\s+my\s+number|how\s+did\s+you\s+get\s+my\s+number)\b/i.test(trimmed)
    if (asksIdentity) {
      const answer = lang === 'en'
        ? "I'm Lidia, Alora's virtual receptionist 😊 You wrote to us a while back about a project, so we have your number from that — I'm just following up to help you set up the call with Walo."
        : 'Soy Lidia, la recepcionista virtual de Alora 😊 Nos escribiste hace un tiempo por un proyecto, por eso tenemos tu número — te estoy siguiendo el hilo para coordinar la llamada con Walo.'
      await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: `${answer}\n\n${confirmLine}` })
      return
    }

    const looksLikeQuestion = trimmed.includes('?') ||
      /^(qu[eé]|c[oó]mo|cu[aá]nto|cu[aá]ndo|tienen|hacen|ofrecen|trabajan|pueden|hay |es posible|what|how|when|do you|can you|why)\b/i.test(trimmed) ||
      /\b(me gustar[ií]a saber|quisiera saber|quiero saber|necesito saber|contame|decime|explicame|qu[eé] hacen|qu[eé] hace alora|a qu[eé] se dedican|I want to know|I'd like to know|could you tell me|tell me)\b/i.test(trimmed)
    if (looksLikeQuestion) {
      const faqResult = await matchFaqOrEscalate(admin, trimmed)
      if (faqResult.action === 'answer' && faqResult.answer) {
        await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: `${faqResult.answer}\n\n${confirmLine}` })
        return
      }
    }

    // Genuinely unmatched reply — this is where the lead is actually stuck.
    // Ladder by consecutive attempt (persisted in bot_next_question):
    //   0 → simple confirmLine, no AI call, stay focused on the ask
    //   1 → Lidia is about to repeat herself for the 2nd time — that's the
    //       signal something's not landing. Use AI, but tightly scoped to
    //       the booking goal, not open-ended chat
    //   2+ → still unresolved after the smart reply — stop looping and
    //        hand off to the team instead of an endless back-and-forth
    if (attempt >= 2) {
      const sentHandoff = await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: getHandoff(lang) })
      if (!sentHandoff) return
      await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
      const { data: leadInfo } = await admin.from('leads').select('nombre, apellido').eq('id', leadId).maybeSingle()
      const leadLabel = [leadInfo?.nombre, leadInfo?.apellido].filter(Boolean).join(' ') || `+${phone}`
      notifyAll({
        title: `🙋 ${leadLabel} se trabó confirmando la llamada`,
        body:  'Lidia no logró que confirme un horario después de varios intentos — pausó la conversación.',
        url:   `/leads/${leadId}`,
      }).catch(() => {})
      return
    }

    const body = attempt === 0
      ? confirmLine
      : (await generateContextAwareBookingReply(admin, { conversationId, fullLabel, lang })) || confirmLine

    const sent = await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body })
    if (sent) {
      const newState = `${BOOKING_CONFIRM_PREFIX}${selectedISO}:::${nextSkip}:::${slotsStr}:::${attempt + 1}`
      await admin.from('whatsapp_conversations').update({ bot_next_question: newState }).eq('id', conversationId)
    }
    return
  }

  await bookConfirmedSlot(admin, { leadId, conversationId, phone, slot: new Date(selectedISO), lang })
}

/**
 * Post-qualifying: Lidia only answers from the team's fixed FAQ list.
 * Detects rescheduling intent and restarts the booking flow.
 * Escalates to a human only when explicitly requested.
 */
async function handleFaqPhase(
  admin: AdminClient,
  { leadId, conversationId, phone, text, lang }: { leadId: string; conversationId: string; phone: string; text: string | null; lang: Lang },
): Promise<void> {
  const t = text?.trim() ?? ''

  // Disengagement check — same as in qualifying and booking phases
  if (t && (DISENGAGEMENT_RE.test(t) || DISENGAGEMENT_RE_EN.test(t))) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? "Understood, no problem! Sorry we couldn't help right now. Whenever you're ready to pick things back up, just write to us — we'll be here 💛 Best of luck!"
        : '¡Entendido, sin problema! Lamentamos no poder ayudarte por ahora. Cuando quieras retomar, escribinos tranquilo — acá vamos a estar 💛 ¡Mucho ánimo!',
    })
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    return
  }

  // Pure greeting (¡Hola!, buenas, hi…) — never run through the FAQ AI, which can
  // misclassify a bare salutation as a human-escalation request and pause the bot.
  // Instead, acknowledge and move straight to the booking offer.
  const FAQ_GREETING_RE = /^[¡¿]?\s*(hola|holi|holis|hi|hey|hello|buenas?|buenos\s+d[ií]as?|buen\s+d[ií]a|buenas\s+tardes?|buenas\s+noches?|qu[eé]\s+tal|c[oó]mo\s+and[aá]s?|buen[a]?s)[!.?\s]*$/i
  if (t && FAQ_GREETING_RE.test(t)) {
    await startBookingFlow(admin, { leadId, conversationId, phone }, 0,
      lang === 'en'
        ? "Hi there! 😊 To help you properly, the best next step is a 30-min call with Walo. Pick the time that works best for you:\n\n"
        : '¡Hola! 😊 Para poder ayudarte mejor, lo ideal es agendar una llamada de 30 min con Walo. Elegí el horario que más te quede bien:\n\n',
      lang,
    )
    return
  }

  // Lead wants to change / pick a different slot → restart booking from scratch
  const wantsReschedule = /\b(otro|otra|otros|cambiar|reagendar|reprogramar|diferente|distinto|quiero otro|quiero otra|cambio|cambien|no me queda|no puedo ese|otro horario|otra fecha|otro dia|otro día|reschedule|change the time|different time|another time|another slot|another date)\b/i.test(t)
  if (wantsReschedule) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? "No problem! Here are the available times for you to pick the one that works best 🗓️"
        : '¡Sin problema! Acá van los horarios disponibles para que elijas el que mejor te quede 🗓️',
    })
    await startBookingFlow(admin, { leadId, conversationId, phone }, 0, undefined, lang)
    return
  }

  // Lead is showing booking intent (affirmation, asking to proceed, etc.)
  // In FAQ mode the lead is already qualified — if they say yes/let's go/when,
  // the natural next step is the booking call, not a generic FAQ answer.
  const wantsBook =
    /\b(agendar|reservar|llamada|reunion|reunión|horario|fecha|cuando empezamos|cuándo empezamos|cuando podemos|cuándo podemos|quiero avanzar|quiero proceder|quiero la (llamada|reunion|reunión)|seguimos|sigamos|como sigo|cómo sigo|próximo paso|proximo paso)\b/i.test(t)
    || /^(sí|si|dale|bueno|ok|okay|perfecto|listo|claro|genial|excelente|bárbaro|barbaro|de acuerdo|me interesa|me parece bien|vamos|adelante|arranquemos|empecemos)\.?\s*$/i.test(t)
    || /^(yes|sure|sounds good|let'?s go|let'?s do it|great|perfect|proceed)\.?\s*$/i.test(t)
  if (wantsBook) {
    await startBookingFlow(admin, { leadId, conversationId, phone }, 0,
      lang === 'en'
        ? "Great! Let's schedule that 30-minute call with Walo 😊 Pick the time that works best for you:\n\n"
        : '¡Perfecto! Te propongo agendar esa llamada de 30 minutos con Walo 😊 Elegí el horario que más te quede bien:\n\n',
      lang,
    )
    return
  }

  // If they ask about getting something free, set expectations gently
  const mentionsGratis = /\b(gratis|gratuito|gratuita|gratuitos|gratuitas|sin costo|sin cobrar|de onda|free)\b/i.test(t)
  if (mentionsGratis) {
    await sendOutboundWhatsAppMessage(admin, {
      conversationId, leadId, phone,
      body: lang === 'en'
        ? "Just so you know, at Alora we're a fully professional team and all our services are paid 🙂 In the meeting with Walo you'll chat about what you need and the pricing — I'm sure it'll be worth it! If you have any more questions, let me know 😊"
        : 'Te cuento que en Alora somos un equipo 100% profesional y todos nuestros servicios son pagos 🙂 En la reunión con Walo van a charlar sobre lo que necesitás y los valores — ¡te aseguro que vale la pena! Si tenés alguna duda más, decime 😊',
    })
    return
  }

  // If the message matches a past project, share the case study then continue to answer any question
  const portfolioMatch = await findPortfolioMatch(t)
  const portfolioMsg   = buildPortfolioMsg(portfolioMatch, lang)
  if (portfolioMsg && portfolioMatch) {
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: portfolioMsg })
    void admin.from('activities').insert({ lead_id: leadId, user_id: null, tipo: 'nota',
      descripcion: `[portfolio-match] Lidia mostró caso "${portfolioMatch.name}" en fase faq.`,
      metadata: { portfolio_case: portfolioMatch.name, phase: 'faq', text: t.slice(0, 200) },
    }).then(undefined, () => {})
  }

  const result = await matchFaqOrEscalate(admin, t)

  if (result.action === 'answer' && result.answer) {
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: result.answer })
    return
  }

  // Only step back (and say so) if they actually asked for a person. Anything
  // else that didn't match a FAQ just gets no reply — Lidia stays in FAQ mode
  // and keeps trying on the next message, instead of going silent for good.
  if (result.humanRequested) {
    const sentHandoff = await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: getHandoff(lang) })
    if (!sentHandoff) return
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    const { data: leadInfo } = await admin.from('leads').select('nombre, apellido').eq('id', leadId).maybeSingle()
    const leadLabel = [leadInfo?.nombre, leadInfo?.apellido].filter(Boolean).join(' ') || `+${phone}`
    notifyAll({
      title: `🙋 ${leadLabel} pidió hablar con alguien`,
      body:  'Lidia pausó la conversación — el lead quiere atención humana.',
      url:   `/leads/${leadId}`,
    }).catch(() => {})
    return
  }

  // Nothing matched — if the lead hasn't booked a meeting yet, re-offer the slots
  // so they never hit a dead-end of silence. Leads in FAQ mode are already qualified;
  // booking is the only remaining step.
  const { data: leadStageCheck } = await admin
    .from('leads')
    .select('estado_pipeline')
    .eq('id', leadId)
    .maybeSingle()

  const alreadyBooked = leadStageCheck?.estado_pipeline === 'reunion_reservada'
    || leadStageCheck?.estado_pipeline === 'reunion_realizada'
    || leadStageCheck?.estado_pipeline === 'propuesta_en_armado'
    || leadStageCheck?.estado_pipeline === 'propuesta_enviada'
    || leadStageCheck?.estado_pipeline === 'follow_up'
    || leadStageCheck?.estado_pipeline === 'cliente_ganado'

  if (!alreadyBooked) {
    await startBookingFlow(admin, { leadId, conversationId, phone }, 0,
      lang === 'en'
        ? "To help you properly, the best next step is a 30-min call with Walo so you can chat about your project in detail 😊 Pick the time that works best for you:\n\n"
        : 'Para poder ayudarte mejor, lo ideal es agendar una llamada de 30 min con Walo para charlar sobre tu proyecto en detalle 😊 Elegí el horario que más te quede bien:\n\n',
      lang,
    )
  }
}
