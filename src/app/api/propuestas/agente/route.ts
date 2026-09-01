import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = process.env.ANTHROPIC_QUALIFYING_MODEL || 'claude-sonnet-5'

const PROPOSAL_TOOL: Anthropic.Tool = {
  name: 'responder',
  description: 'Generá la respuesta del agente presupuestador y el borrador actual de la propuesta.',
  input_schema: {
    type: 'object' as const,
    required: ['mensaje_agente', 'propuesta'],
    properties: {
      mensaje_agente: {
        type: 'string',
        description: 'Mensaje corto (2-4 líneas) para el equipo de Alora, no para el cliente: qué hiciste o cambiaste, y por qué. Ej: "Armé una propuesta de USD 1200 para un ecommerce chico con MercadoPago, con foco en catálogo y pagos."',
      },
      propuesta: {
        type: 'object',
        required: ['titulo', 'resumen', 'alcance', 'entregables', 'cronograma', 'moneda', 'monto', 'notas'],
        properties: {
          titulo: { type: 'string', description: 'Título de la propuesta, ej. "Sitio web + tienda online — Estudio Jurídico Pérez"' },
          resumen: { type: 'string', description: '2-3 oraciones dirigidas al CLIENTE explicando qué se le va a entregar y por qué resuelve lo que pidió.' },
          alcance: { type: 'array', items: { type: 'string' }, description: '3-6 puntos de qué incluye el proyecto, en lenguaje claro para el cliente.' },
          entregables: { type: 'array', items: { type: 'string' }, description: '3-6 entregables concretos (ej. "Sitio responsive de hasta 5 secciones", "Integración con MercadoPago").' },
          cronograma: { type: 'string', description: 'Estimación de tiempo de entrega en una frase, ej. "3 a 4 semanas desde la aprobación".' },
          moneda: { type: 'string', enum: ['USD', 'ARS'] },
          monto: { type: 'number', description: 'Monto estimado, un número entero razonable para el alcance descrito, sin un precio de referencia fijo — usá tu criterio sobre el mercado de desarrollo web/apps en LATAM.' },
          notas: { type: 'string', description: 'Nota interna breve para el equipo (no se le muestra al cliente): supuestos que hiciste, o qué falta confirmar.' },
        },
      },
    },
  },
}

const SYSTEM = `Sos el agente presupuestador de Alora, una agencia de tecnología digital (sitios web, apps, ecommerce, bots de WhatsApp, sistemas de gestión) para clientes de toda LATAM, EEUU y España.

Tu trabajo: a partir de la información real de un lead (y lo que te pida el equipo en el chat), armar y refinar una propuesta comercial lista para mandarle al cliente — con alcance, entregables, cronograma y un monto estimado.

Reglas:
- No inventes datos del lead que no te dieron — si falta información clave para presupuestar bien, decilo en "notas" y hacé el mejor estimado posible con lo que hay, no le pidas al equipo que te complete nada por chat, ellos no son el cliente.
- El monto es una ESTIMACIÓN tuya basada en el alcance — no hay una lista de precios fija. Sé razonable para el mercado de desarrollo web/apps de una agencia profesional en LATAM, ni regalado ni desproporcionado. Si el equipo te pide un monto puntual, usá ese.
- "resumen", "alcance", "entregables" y "cronograma" están dirigidos al CLIENTE final — profesional, claro, sin jerga técnica innecesaria.
- Cada vez que te pidan un cambio (cambiar precio, sacar o agregar algo, cambiar el tono), actualizá la propuesta completa reflejando el pedido — no repitas la propuesta anterior sin cambios.
- Nunca reveles stack técnico interno ni qué tecnología de IA usa Alora, ni acá ni en el contenido de la propuesta.`

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'IA no configurada' }, { status: 503 })
  }

  const body = await req.json()
  const { leadId, mensajes } = body as { leadId: string; mensajes: ChatMessage[] }

  if (!leadId || !Array.isArray(mensajes) || mensajes.length === 0) {
    return NextResponse.json({ error: 'leadId y mensajes son requeridos' }, { status: 400 })
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('nombre, apellido, empresa, pais, sitio_web, servicios_interesados, consulta_detallada')
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
    const { data: waMessages } = await supabase
      .from('wa_messages')
      .select('direction, body')
      .eq('conversation_id', convo.id)
      .not('body', 'is', null)
      .order('created_at', { ascending: true })
      .limit(40)
    transcript = (waMessages ?? [])
      .map(m => `${m.direction === 'inbound' ? 'Lead' : 'Alora'}: ${m.body}`)
      .join('\n')
  }

  const contextParts: string[] = [
    `Nombre: ${[lead.nombre, lead.apellido].filter(Boolean).join(' ')}`,
  ]
  if (lead.empresa) contextParts.push(`Empresa: ${lead.empresa}`)
  if (lead.pais) contextParts.push(`País: ${lead.pais}`)
  if (lead.sitio_web) contextParts.push(`Sitio web actual: ${lead.sitio_web}`)
  if (lead.servicios_interesados?.length) contextParts.push(`Servicios de interés: ${lead.servicios_interesados.join(', ')}`)
  if (lead.consulta_detallada) contextParts.push(`Proyecto (según la ficha): ${lead.consulta_detallada}`)

  const contextBlock = `INFO DEL LEAD:\n${contextParts.join('\n')}`
    + (transcript ? `\n\nCONVERSACIÓN DE WHATSAPP:\n${transcript}` : '')

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const result = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: contextBlock },
      ],
      tools: [PROPOSAL_TOOL],
      tool_choice: { type: 'tool', name: 'responder' },
      messages: mensajes,
    })

    const toolUse = result.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      return NextResponse.json({ error: 'Sin respuesta de IA' }, { status: 500 })
    }

    return NextResponse.json({ data: toolUse.input })
  } catch (err) {
    console.error('[Propuestas Agente] Error:', err)
    return NextResponse.json({ error: 'Error generando la propuesta' }, { status: 500 })
  }
}
