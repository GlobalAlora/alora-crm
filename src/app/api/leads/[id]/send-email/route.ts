import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail, getSenderName, GMAIL_SENDERS } from '@/lib/google-gmail'
import type { SenderEmail } from '@/lib/google-gmail'

type Params = { params: Promise<{ id: string }> }

const VALID_SENDER_EMAILS = GMAIL_SENDERS.map(s => s.email)

export async function POST(req: NextRequest, { params }: Params) {
  const { id: leadId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    return NextResponse.json({ error: 'Gmail no configurado (falta GOOGLE_SERVICE_ACCOUNT_EMAIL)' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const { subject, html, fromEmail, threadId, inReplyTo, references } = body as {
    subject?:    string
    html?:       string
    fromEmail?:  string
    threadId?:   string
    inReplyTo?:  string
    references?: string
  }

  if (!subject?.trim()) return NextResponse.json({ error: 'El asunto es requerido' }, { status: 400 })
  if (!html?.trim())    return NextResponse.json({ error: 'El cuerpo del email es requerido' }, { status: 400 })

  const resolvedFrom = (VALID_SENDER_EMAILS.includes(fromEmail as SenderEmail)
    ? fromEmail
    : GMAIL_SENDERS[0].email) as SenderEmail

  const adminSupabase = createAdminClient()

  // Fetch lead
  const { data: lead, error: leadError } = await adminSupabase
    .from('leads')
    .select('id, nombre, apellido, email, empresa')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  if (!lead.email)        return NextResponse.json({ error: 'Este lead no tiene email cargado' }, { status: 400 })

  const toName = [lead.nombre, lead.apellido].filter(Boolean).join(' ')

  // Send via Gmail API
  let result: Awaited<ReturnType<typeof sendGmail>>
  try {
    result = await sendGmail({
      from:       resolvedFrom,
      to:         lead.email,
      toName,
      subject:    subject.trim(),
      html:       html.trim(),
      threadId:   threadId  ?? null,
      inReplyTo:  inReplyTo ?? null,
      references: references ?? null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[send-email] Gmail error:', msg)
    return NextResponse.json(
      { error: `Error al enviar por Gmail: ${msg}` },
      { status: 500 }
    )
  }

  // Log activity (best-effort)
  await adminSupabase.from('activities').insert({
    lead_id:  leadId,
    user_id:  user.id,
    tipo:     'email',
    descripcion: `<strong>Para:</strong> ${lead.email}<br><strong>Asunto:</strong> ${subject.trim()}<br><br>${html.trim()}`,
    metadata: {
      direction:  'outbound',
      subject:    subject.trim(),
      to:         lead.email,
      to_name:    toName,
      from:       resolvedFrom,
      from_name:  getSenderName(resolvedFrom),
      gmail_id:   result.gmailId,
      thread_id:  result.threadId,
      message_id: result.messageId,
    },
  })

  return NextResponse.json({
    success:   true,
    message:   `Email enviado a ${lead.email}`,
    threadId:  result.threadId,
    messageId: result.messageId,
  })
}
