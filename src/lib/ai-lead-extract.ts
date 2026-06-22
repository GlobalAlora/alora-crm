import Anthropic from '@anthropic-ai/sdk'
import { PAISES, SERVICIOS } from '@/types'

const MODEL = process.env.ANTHROPIC_LEAD_EXTRACT_MODEL || 'claude-haiku-4-5-20251001'

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export interface ExtractedLeadInfo {
  empresa?: string
  sitio_web?: string
  pais?: string
  email?: string
  servicios_interesados?: string[]
}

export interface ConversationMessage {
  direction: 'inbound' | 'outbound'
  body: string | null
}

/**
 * Reads a WhatsApp conversation and pulls out lead info the client has
 * explicitly mentioned (company, website, country, email, services of
 * interest). Returns null if nothing usable was found or the model isn't
 * configured — never invents data that wasn't actually said.
 */
export async function extractLeadInfoFromConversation(messages: ConversationMessage[]): Promise<ExtractedLeadInfo | null> {
  const client = getClient()
  if (!client) return null

  const transcript = messages
    .filter((m) => m.body?.trim())
    .map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'Alora'}: ${m.body}`)
    .join('\n')

  if (!transcript.trim()) return null

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Esta es una conversación de WhatsApp entre un cliente potencial y Alora (agencia de marketing/desarrollo). Extraé los datos que el cliente haya mencionado explícitamente.\n\n${transcript}`,
      }],
      tools: [{
        name: 'extraer_datos_lead',
        description: 'Registra los datos del cliente mencionados con claridad en la conversación. Omití cualquier campo que no se haya dicho explícitamente — nunca inventes ni adivines.',
        input_schema: {
          type: 'object',
          properties: {
            empresa: { type: 'string', description: 'Nombre de la empresa o negocio del cliente, si lo mencionó' },
            sitio_web: { type: 'string', description: 'Sitio web del cliente, si lo mencionó' },
            pais: { type: 'string', enum: PAISES, description: 'País del cliente, solo si se puede inferir con confianza' },
            email: { type: 'string', description: 'Email del cliente, si lo mencionó' },
            servicios_interesados: {
              type: 'array',
              items: { type: 'string', enum: SERVICIOS },
              description: 'Servicios de la lista por los que el cliente mostró interés explícito',
            },
          },
        },
      }],
      tool_choice: { type: 'tool', name: 'extraer_datos_lead' },
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') return null
    return toolUse.input as ExtractedLeadInfo
  } catch (err) {
    console.error('[AI] Failed to extract lead info from conversation:', err)
    return null
  }
}
