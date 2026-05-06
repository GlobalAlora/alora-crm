import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id: leadId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY no configurado' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const { subject, html, fromName, fromEmail } = body as {
    subject?: string
    html?: string
    fromName?: string
    fromEmail?: string
  }

  if (!subject?.trim()) return NextResponse.json({ error: 'El asunto es requerido' }, { status: 400 })
  if (!html?.trim()) return NextResponse.json({ error: 'El cuerpo del email es requerido' }, { status: 400 })

  const adminSupabase = createAdminClient()

  // Fetch lead
  const { data: lead, error: leadError } = await adminSupabase
    .from('leads')
    .select('id, nombre, apellido, email, empresa')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  }

  if (!lead.email) {
    return NextResponse.json({ error: 'Este lead no tiene email cargado' }, { status: 400 })
  }

  const senderName = fromName?.trim() || 'Alora CRM'
  const senderEmail = fromEmail?.trim() || 'hola@reply.globalalora.com'
  // Replies go to a globalalora.com address so Resend inbound can capture them
  const replyTo = 'reply@reply.globalalora.com'

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: sendError } = await resend.emails.send({
    from: `${senderName} <${senderEmail}>`,
    to: [lead.email],
    replyTo: replyTo,
    subject: subject.trim(),
    html: html.trim(),
  })

  if (sendError) {
    console.error('[send-email]', sendError)
    return NextResponse.json({ error: `Error al enviar: ${sendError.message}` }, { status: 500 })
  }

  // Log activity
  const nombre = [lead.nombre, lead.apellido].filter(Boolean).join(' ')
  await adminSupabase.from('activities').insert({
    lead_id: leadId,
    user_id: user.id,
    tipo: 'email',
    descripcion: `<strong>Para:</strong> ${lead.email}<br><strong>Asunto:</strong> ${subject.trim()}<br><br>${html.trim()}`,
    metadata: {
      direction: 'outbound',
      subject: subject.trim(),
      to: lead.email,
      to_name: nombre,
    },
  })

  return NextResponse.json({ success: true, message: `Email enviado a ${lead.email}` })
}
