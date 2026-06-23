import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'

type AdminClient = ReturnType<typeof createAdminClient>

// Order in which the qualifying bot asks for missing info.
const QUESTION_ORDER = ['email', 'empresa', 'sitio_web', 'pais', 'servicios_interesados'] as const
type QuestionField = typeof QUESTION_ORDER[number]

const QUESTION_TEXT: Record<QuestionField, string> = {
  email:                 '¿Cuál es tu email?',
  empresa:               '¿Tenés una empresa o negocio? ¿Cómo se llama?',
  sitio_web:             '¿Tenés sitio web? Si tenés, pasame el link (si no tenés, no hay drama).',
  pais:                  '¿Desde qué país nos escribís?',
  servicios_interesados: '¿En qué servicio estás interesado? (ej. diseño web, mantenimiento, redes sociales, branding, etc.)',
}

const WELCOME = '¡Hola! 👋 Soy el asistente de Alora. Antes de pasarte con el equipo, te hago un par de preguntas rápidas para conocerte mejor.'
const CLOSING = '¡Buenísimo, ya tengo todo! 🙌 En breve te responde alguien del equipo.'

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
 */
export async function advanceQualifyingBot(
  admin: AdminClient,
  { leadId, conversationId, phone, isNewConversation }: {
    leadId: string
    conversationId: string
    phone: string
    isNewConversation: boolean
  },
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
  const startIdx = isNewConversation ? 0 : lastAskedIdx + 1

  const nextField = QUESTION_ORDER.slice(startIdx).find((f) => !isFieldFilled(lead, f))

  if (!nextField) {
    // Nothing left to ask. Only announce completion if we'd actually asked
    // at least one question before (skip a silent close on a fully-prefilled lead).
    if (lastAskedIdx >= 0 || isNewConversation) {
      await sendOutboundWhatsAppMessage(admin, { conversationId, leadId, phone, body: CLOSING })
    }
    await admin
      .from('whatsapp_conversations')
      .update({ bot_active: false, bot_next_question: null })
      .eq('id', conversationId)
    return
  }

  const prefix = isNewConversation ? `${WELCOME}\n\n` : ''
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
