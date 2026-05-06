/**
 * Resend Inbound Email Webhook
 *
 * Fires when a lead replies to an email (reply@reply.globalalora.com).
 * Matches sender email to a lead and logs the reply as an inbound activity.
 *
 * Resend inbound payload reference:
 * https://resend.com/docs/api-reference/webhooks/email-events
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Resend sends inbound email data as a webhook event
interface ResendInboundEvent {
  type: 'email.received'
  data: {
    from: string          // "Name <email@domain.com>" or "email@domain.com"
    to: string[]          // ["reply@globalalora.com"]
    subject?: string
    html?: string
    text?: string
    headers?: Record<string, string>
  }
}

function extractEmail(raw: string): string {
  if (!raw) return ''
  const match = raw.match(/<([^>]+)>/)
  return (match ? match[1] : raw).toLowerCase().trim()
}

function extractName(raw: string): string {
  const match = raw.match(/^(.+?)\s*</)
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : ''
}

function stripQuotedReply(html: string): string {
  return html
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<div class="gmail_quote"[\s\S]*?<\/div>/gi, '')
    .trim()
}

export async function POST(req: NextRequest) {
  let event: ResendInboundEvent

  try {
    event = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Support both direct payload and wrapped event format
  const data = (event as { data?: ResendInboundEvent['data'] }).data ?? (event as unknown as ResendInboundEvent['data'])

  const fromRaw = data?.from ?? ''
  const senderEmail = extractEmail(fromRaw)
  const senderDisplayName = extractName(fromRaw)

  if (!senderEmail) {
    return NextResponse.json({ error: 'No sender email' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  // Match sender to a lead by email
  const { data: lead } = await adminSupabase
    .from('leads')
    .select('id, nombre, apellido')
    .ilike('email', senderEmail)
    .maybeSingle()

  if (!lead) {
    // No matching lead — acknowledge without error so Resend doesn't retry
    return NextResponse.json({ ok: true, note: 'No matching lead for ' + senderEmail })
  }

  const leadName = senderDisplayName ||
    [lead.nombre, lead.apellido].filter(Boolean).join(' ') ||
    senderEmail

  const subject = data?.subject ?? '(sin asunto)'
  const rawHtml = data?.html ?? ''
  const rawText = data?.text ?? ''

  // Prefer HTML, strip quoted content, fall back to plain text
  const body = rawHtml
    ? stripQuotedReply(rawHtml)
    : rawText.split(/\n>{1,}|\nOn .+wrote:/)[0].replace(/\n/g, '<br>').trim()

  await adminSupabase.from('activities').insert({
    lead_id: lead.id,
    user_id: null,
    tipo: 'email',
    descripcion: [
      `<strong>✉ Respuesta de ${leadName}</strong>`,
      `<span style="color:#64748b;font-size:12px">Asunto: ${subject}</span>`,
      '',
      body || rawHtml || rawText || '(mensaje vacío)',
    ].join('<br>'),
    metadata: {
      direction: 'inbound',
      from: senderEmail,
      from_name: leadName,
      subject,
    },
  })

  return NextResponse.json({ ok: true })
}
