import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'

type AdminClient = ReturnType<typeof createAdminClient>

// Order in which the qualifying bot asks for missing info.
const QUESTION_ORDER = ['email', 'empresa', 'sitio_web', 'pais', 'servicios_interesados'] as const
type QuestionField = typeof QUESTION_ORDER[number]

const QUESTION_TEXT: Record<QuestionField, string> = {
  email:                 'Para arrancar, ¿me pasás tu email? 📧',
  empresa:               '¿Tenés una empresa o negocio? Contame cómo se llama 😊',
  sitio_web:             '¿Ya tenés un sitio web? Si tenés, pasame el link (si no tenés todavía, tranquilo, no es obligatorio)',
  pais:                  '¿Desde qué país me escribís?',
  servicios_interesados: 'Y por último, ¿en qué te podemos ayudar? (por ejemplo: diseño web, mantenimiento, redes sociales, branding, marketing, etc.) ✨',
}

const WELCOME = '¡Hola! 👋 Soy Lidia, la asistente virtual de Alora. ¡Qué alegría que nos escribas! Antes de pasarte con alguien del equipo, te hago unas preguntitas rápidas para conocerte mejor 🙂'
const CLOSING = '¡Listo, ya tengo todo lo que necesitaba! 🎉 Gracias por tu paciencia — en breve te escribe alguien del equipo de Alora para ayudarte. ¡Que tengas un lindo día! 💛'

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
 * Drives the qualifying bot for one inbound message: figures out which
 * question (if any) to ask next, sends it, and stores where we're up to.
 * Call this after the AI enrichment step so it sees the freshest lead data.
 *
 * Whether to show the welcome / how far along we are is driven entirely by
 * `bot_next_question` on the conversation row — not by whether the lead
 * itself is new — so resetting a conversation (e.g. bot_next_question set
 * back to null) always restarts cleanly with the welcome message.
 */
export async function advanceQualifyingBot(
  admin: AdminClient,
  { leadId, conversationId, phone }: { leadId: string; conversationId: string; phone: string },
): Promise<void> {
  const { data: convo } = await admin
    .from('whatsapp_conversations')
    .select('bot_active, bot_next_question')
    .eq('id', conversationId)
    .single()

  if (!convo || convo.bot_active === false) return

  const { data: lead } = await admin
    .from('leads')
    .select('email, empresa, sitio_web, pais, servicios_interesados')
    .eq('id', leadId)
    .single()

  if (!lead) return

  // Whatever we last asked counts as "answered" (even with a "no") — resume
  // looking for missing fields right after it, not from the start.
  const lastAskedIdx = convo.bot_next_question
    ? QUESTION_ORDER.indexOf(convo.bot_next_question as QuestionField)
    : -1
  const isFreshStart = lastAskedIdx === -1
  const startIdx = isFreshStart ? 0 : lastAskedIdx + 1

  const nextField = QUESTION_ORDER.slice(startIdx).find((f) => !isFieldFilled(lead, f))

  if (!nextField) {
    // Nothing left to ask. Skip a silent close if the bot never actually
    // got to ask anything (e.g. the lead arrived already fully filled in).
    if (!isFreshStart) {
      await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: CLOSING })
    }
    await admin
      .from('whatsapp_conversations')
      .update({ bot_active: false, bot_next_question: null })
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
