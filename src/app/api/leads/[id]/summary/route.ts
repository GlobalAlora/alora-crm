import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

type Params = { params: Promise<{ id: string }> }

const MODEL = process.env.ANTHROPIC_LEAD_EXTRACT_MODEL || 'claude-haiku-4-5-20251001'

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'IA no configurada' }, { status: 503 })
  }

  const [{ data: lead }, { data: messages }, { data: activities }] = await Promise.all([
    supabase
      .from('leads')
      .select('nombre, apellido, empresa, pais, email, telefono, servicios_interesados, consulta_detallada, notas, estado_pipeline, presupuesto_usd, dias_sin_respuesta, reunion_fecha, propuesta_valor_usd, fuente')
      .eq('id', id)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('wa_messages')
      .select('direction, body, created_at')
      .eq('lead_id', id)
      .order('created_at', { ascending: true })
      .limit(30),
    supabase
      .from('activities')
      .select('type, content, created_at')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (!lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })

  const { data: stageRow } = await supabase
    .from('pipeline_stages')
    .select('label')
    .eq('key', lead.estado_pipeline)
    .maybeSingle()
  const stageName = stageRow?.label ?? lead.estado_pipeline

  const parts: string[] = []

  parts.push(`Nombre: ${lead.nombre}${lead.apellido ? ` ${lead.apellido}` : ''}`)
  if (lead.empresa) parts.push(`Empresa: ${lead.empresa}`)
  if (lead.pais) parts.push(`País: ${lead.pais}`)
  if (lead.email) parts.push(`Email: ${lead.email}`)
  if (lead.fuente) parts.push(`Fuente: ${lead.fuente}`)
  parts.push(`Etapa: ${stageName}`)
  if (lead.servicios_interesados?.length) parts.push(`Servicios de interés: ${lead.servicios_interesados.join(', ')}`)
  if (lead.consulta_detallada) parts.push(`Consulta detallada: ${lead.consulta_detallada}`)
  if (lead.presupuesto_usd) parts.push(`Presupuesto: USD ${lead.presupuesto_usd}`)
  if (lead.propuesta_valor_usd) parts.push(`Propuesta enviada: USD ${lead.propuesta_valor_usd}`)
  if (lead.reunion_fecha) parts.push(`Reunión: ${lead.reunion_fecha}`)
  if (lead.dias_sin_respuesta != null) parts.push(`Días sin respuesta: ${lead.dias_sin_respuesta}`)
  if (lead.notas) parts.push(`Notas internas: ${lead.notas}`)

  const transcript = (messages ?? [])
    .filter((m) => m.body?.trim())
    .map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'Alora'}: ${m.body}`)
    .join('\n')

  const recentActivity = (activities ?? [])
    .filter((a) => a.content?.trim())
    .slice(0, 5)
    .map((a) => `- [${a.type}] ${a.content}`)
    .join('\n')

  const prompt = `Sos asistente de ventas de Alora, una agencia de diseño web, branding y marketing digital.

Datos del lead:
${parts.join('\n')}

${transcript ? `Conversación de WhatsApp (últimos mensajes):\n${transcript}` : ''}

${recentActivity ? `Actividad reciente:\n${recentActivity}` : ''}

Escribí un resumen ejecutivo de este lead en 2-3 oraciones. Debe incluir: quién es, qué necesita, en qué etapa está, y cuál es el próximo paso recomendado. Sé directo y accionable. Respondé solo con el resumen, sin títulos ni formato extra.`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') {
      return NextResponse.json({ error: 'Sin respuesta de IA' }, { status: 500 })
    }

    return NextResponse.json({ summary: text.text.trim() })
  } catch (err) {
    console.error('[AI Summary] Error:', err)
    return NextResponse.json({ error: 'Error generando resumen' }, { status: 500 })
  }
}
