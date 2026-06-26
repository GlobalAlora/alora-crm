import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'
import { matchFaqOrEscalate } from '@/lib/whatsapp-faq'

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
  email: {
    isValid: (t) => /\S+@\S+\.\S+/.test(t),
    pushback: 'Te pido el email puntualmente porque es importante para que el equipo te pueda hacer seguimiento — ¿tenés alguno que me puedas pasar? 🙏',
  },
  consulta_detallada: {
    isValid: (t) => t.trim().split(/\s+/).length >= 5,
    pushback: '¿Me podés contar un poco más en detalle? Cuanto más contexto me das, mejor te puede ayudar el equipo 🙏',
  },
}

const QUESTION_TEXT: Record<QuestionField, string> = {
  nombre:                '¿Cómo te llamás?',
  consulta_detallada:    'Contame con el mayor detalle posible qué necesitás, así te puedo ayudar mejor 🙂',
  email:                 '¿Me pasás tu email? 📧',
  empresa:               '¿Tenés una empresa o negocio? Contame cómo se llama 😊',
  sitio_web:             '¿Ya tenés un sitio web? Si tenés, pasame el link (si no tenés todavía, tranquilo, no es obligatorio)',
  pais:                  '¿Desde qué país me escribís?',
  servicios_interesados: '¿En qué servicio puntual estás interesado? (por ejemplo: diseño web, mantenimiento, redes sociales, branding, marketing, etc.) ✨',
}

const WELCOME = '¡Hola! 👋 Soy Lidia, de Alora. ¡Qué alegría que nos escribas! 🙂'
const CLOSING = '¡Listo, ya tengo todo lo que necesitaba! 🎉 Gracias por tu paciencia.\n\n'
  + 'Te propongo agendar una llamada de relevamiento rápida con Walo, así charlan tranquilos sobre lo que necesitás:\n'
  + 'https://www.globalalora.com/es/llamada-de-relevamiento\n\n'
  + 'Elegí el horario que más te quede cómodo y ahí se conectan 💛\n\n'
  + 'Mientras tanto, si tenés alguna otra duda, escribime tranquilo que te ayudo 🙂'
const HANDOFF = 'Dejame que te conecte con alguien del equipo para ayudarte mejor con esto 🙂 En breve te responden.'

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
    // Existing clients: always straight to a human, never the bot — not even
    // a welcome message. Force bot_active off in case it was somehow on.
    await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conversationId)
    return
  }

  const { data: convo } = await admin
    .from('whatsapp_conversations')
    .select('bot_active, bot_phase, bot_next_question')
    .eq('id', conversationId)
    .single()

  if (!convo || convo.bot_active === false) return

  if (convo.bot_phase === 'faq') {
    await handleFaqPhase(admin, { leadId, conversationId, phone, text })
    return
  }

  await advanceQualifyingBot(admin, { leadId, conversationId, phone, text, botNextQuestion: convo.bot_next_question })
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
  { leadId, conversationId, phone, text, botNextQuestion }: {
    leadId: string
    conversationId: string
    phone: string
    text: string | null
    botNextQuestion: string | null
  },
): Promise<void> {
  // A "<field>__retry" sentinel means we already pushed back once on that
  // field and are now looking at the second attempt — accept it no matter what.
  const isRetry = !!botNextQuestion?.endsWith('__retry')
  const askedField = isRetry
    ? (botNextQuestion!.slice(0, -'__retry'.length) as QuestionField)
    : (botNextQuestion as QuestionField | null)

  const trimmed = text?.trim() || ''

  // Push back once on a non-answer to a validated field instead of silently
  // moving on (e.g. "no tengo" to the email question).
  const validator = askedField ? VALIDATORS[askedField] : undefined
  if (validator && trimmed && !validator.isValid(trimmed) && !isRetry) {
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: validator.pushback })
    await admin
      .from('whatsapp_conversations')
      .update({ bot_next_question: `${askedField}__retry` })
      .eq('id', conversationId)
    return
  }

  // The field we just asked about isn't AI-inferred — save the raw reply
  // directly (if any) before deciding what's next.
  if (askedField && DIRECT_SAVE_FIELDS.has(askedField) && trimmed) {
    await admin.from('leads').update({ [askedField]: trimmed }).eq('id', leadId)
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

  // Whatever we last asked counts as "answered" (even with a "no") — resume
  // looking for missing fields right after it, not from the start.
  const lastAskedIdx = askedField ? QUESTION_ORDER.indexOf(askedField) : -1
  const isFreshStart = lastAskedIdx === -1
  const startIdx = isFreshStart ? 0 : lastAskedIdx + 1

  const nextField = QUESTION_ORDER.slice(startIdx).find((f) => !isFieldFilled(lead, f))

  if (!nextField) {
    // Nothing left to ask. Skip a silent close if the bot never actually
    // got to ask anything (e.g. the lead arrived already fully filled in).
    if (!isFreshStart) {
      await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: CLOSING })
    }
    // Hand off to FAQ mode instead of switching the bot off entirely —
    // Lidia keeps handling what she can; a human only steps in when needed.
    await admin
      .from('whatsapp_conversations')
      .update({ bot_phase: 'faq', bot_next_question: null })
      .eq('id', conversationId)
    return
  }

  if (isFreshStart) {
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
      body: `${WELCOME}\n\n${QUESTION_TEXT[nextField]}`,
    })
    return
  }

  await sendOutboundWhatsAppMessage(admin, {
    conversationId,
    leadId,
    phone,
    body: QUESTION_TEXT[nextField],
  })

  await admin
    .from('whatsapp_conversations')
    .update({ bot_next_question: nextField })
    .eq('id', conversationId)
}

/**
 * Post-qualifying: Lidia only answers from the team's fixed FAQ list.
 * Anything else (explicit request for a human, complaints, exact pricing,
 * or just no confident match) gets escalated to a human instead of guessed.
 */
async function handleFaqPhase(
  admin: AdminClient,
  { leadId, conversationId, phone, text }: { leadId: string; conversationId: string; phone: string; text: string | null },
): Promise<void> {
  const result = await matchFaqOrEscalate(admin, text ?? '')

  if (result.action === 'answer' && result.answer) {
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: result.answer })
    return
  }

  // Only step back (and say so) if they actually asked for a person. Anything
  // else that didn't match a FAQ just gets no reply — Lidia stays in FAQ mode
  // and keeps trying on the next message, instead of going silent for good.
  if (result.humanRequested) {
    await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: HANDOFF })
    await admin
      .from('whatsapp_conversations')
      .update({ bot_active: false })
      .eq('id', conversationId)
  }
}
