import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

const MODEL = process.env.ANTHROPIC_LEAD_EXTRACT_MODEL || 'claude-haiku-4-5-20251001'

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export interface FaqMatchResult {
  action: 'answer' | 'escalate'
  answer?: string
  humanRequested?: boolean
}

/**
 * After the qualifying questions, Lidia can only answer from a fixed list of
 * FAQs the team defines (whatsapp_faqs). Anything that doesn't clearly match
 * one of them — explicit request for a human, complaints, exact pricing/
 * deadline questions, anything ambiguous — gets escalated instead of
 * improvised, on purpose.
 */
export async function matchFaqOrEscalate(admin: AdminClient, message: string): Promise<FaqMatchResult> {
  if (!message.trim()) return { action: 'escalate' }

  const { data: faqs } = await admin
    .from('whatsapp_faqs')
    .select('pregunta, respuesta')
    .eq('activo', true)
    .order('orden', { ascending: true })

  if (!faqs || faqs.length === 0) return { action: 'escalate' }

  const client = getClient()
  if (!client) return { action: 'escalate' }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system:
        'Sos Lidia, la asistente de WhatsApp de Alora. Tu única tarea es decidir si el mensaje del cliente ' +
        'coincide con claridad con alguna de las preguntas frecuentes de la lista. Si coincide con confianza, ' +
        'elegí esa pregunta. Si el cliente pide hablar con una persona, hace un reclamo o queja, pregunta un ' +
        'precio o plazo específico, o el mensaje es ambiguo o no coincide con ninguna pregunta de la lista, ' +
        'escalá a un humano. Nunca improvises una respuesta que no esté en la lista.',
      messages: [{
        role: 'user',
        content: `Mensaje del cliente: "${message}"\n\nPreguntas frecuentes disponibles:\n${faqs.map((f, i) => `${i + 1}. ${f.pregunta}`).join('\n')}`,
      }],
      tools: [{
        name: 'decidir',
        description: 'Registra si hay que responder con una FAQ conocida o escalar a un humano.',
        input_schema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['answer', 'escalate'] },
            faq_index: { type: 'integer', description: 'Si action es "answer": número (empezando en 1) de la pregunta de la lista que coincide.' },
            human_requested: { type: 'boolean', description: 'true solo si, al escalar, el cliente pidió explícitamente hablar con una persona del equipo.' },
          },
          required: ['action'],
        },
      }],
      tool_choice: { type: 'tool', name: 'decidir' },
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') return { action: 'escalate' }

    const input = toolUse.input as { action: 'answer' | 'escalate'; faq_index?: number; human_requested?: boolean }
    if (input.action === 'answer' && input.faq_index && faqs[input.faq_index - 1]) {
      return { action: 'answer', answer: faqs[input.faq_index - 1].respuesta }
    }
    return { action: 'escalate', humanRequested: !!input.human_requested }
  } catch (err) {
    console.error('[AI] FAQ matching failed:', err)
    return { action: 'escalate' }
  }
}
