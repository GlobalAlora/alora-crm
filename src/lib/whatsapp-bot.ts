import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'
import { matchFaqOrEscalate } from '@/lib/whatsapp-faq'

type AdminClient = ReturnType<typeof createAdminClient>

// Order in which the qualifying bot asks for missing info.
const QUESTION_ORDER = ['servicios_interesados', 'email', 'empresa', 'sitio_web', 'pais'] as const
type QuestionField = typeof QUESTION_ORDER[number]

const QUESTION_TEXT: Record<QuestionField, string> = {
  email:                 'Para arrancar, ¿me pasás tu email? 📧',
  empresa:               '¿Tenés una empresa o negocio? Contame cómo se llama 😊',
  sitio_web:             '¿Ya tenés un sitio web? Si tenés, pasame el link (si no tenés todavía, tranquilo, no es obligatorio)',
  pais:                  '¿Desde qué país me escribís?',
  servicios_interesados: '¿En qué te podemos ayudar? Contame qué estás buscando (por ejemplo: diseño web, mantenimiento, redes sociales, branding, marketing, etc.) ✨',
}

const WELCOME = '¡Hola! 👋 Soy Lidia, de Alora. ¡Qué alegría que nos escribas! 🙂'
const CLOSING = '¡Listo, ya tengo todo lo que necesitaba! 🎉 Gracias por tu paciencia.\n\n'
  + 'Para avanzar, te propongo agendar una llamada de relevamiento rápida con Walo, así charlan tranquilos sobre lo que necesitás:\n'
  + 'https://www.globalalora.com/es/llamada-de-relevamiento\n\n'
  + 'Elegí el horario que más te quede cómodo y ahí se conectan 💛\n\n'
  + 'Mientras tanto, si tenés alguna otra duda, escribime tranquilo que te ayudo 🙂'
const HANDOFF = 'Dejame que te conecte con alguien del equipo para ayudarte mejor con esto 🙂 En breve te responden.'

interface LeadSnapshot {
  email: string | null
  empresa: string | null
  sitio_web: string | null
  pais: string | null
  servicios_interesados: string[] | null
}

function isFieldFilled(lead: LeadSnapshot, field: QuestionField): boolean {
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

  await advanceQualifyingBot(admin, { leadId, conversationId, phone, botNextQuestion: convo.bot_next_question })
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
  { leadId, conversationId, phone, botNextQuestion }: {
    leadId: string
    conversationId: string
    phone: string
    botNextQuestion: string | null
  },
): Promise<void> {
  const { data: lead } = await admin
    .from('leads')
    .select('email, empresa, sitio_web, pais, servicios_interesados')
    .eq('id', leadId)
    .single()

  if (!lead) return

  // Whatever we last asked counts as "answered" (even with a "no") — resume
  // looking for missing fields right after it, not from the start.
  const lastAskedIdx = botNextQuestion ? QUESTION_ORDER.indexOf(botNextQuestion as QuestionField) : -1
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

  const prefix = isFreshStart ? `${WELCOME}\n\n` : ''
  await sendOutboundWhatsAppMessage(admin, {
    conversationId,
    leadId,
    phone,
    body: `${prefix}${QUESTION_TEXT[nextField]}`,
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

  await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: HANDOFF })
  await admin
    .from('whatsapp_conversations')
    .update({ bot_active: false })
    .eq('id', conversationId)
}
