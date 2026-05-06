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
  // Remove Gmail quote block (may be deeply nested — remove the outer wrapper)
  let stripped = html
    .replace(/<div class="gmail_quote"[\s\S]*$/i, '')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()

  // If stripping removed everything, return the full html so we don't lose the message
  if (!stripped || stripped.replace(/<[^>]*>/g, '').trim() === '') {
    return html
  }
  return stripped
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
  const emailId = (data as Record<string, unknown>)?.email_id as string | undefined

  // Resend inbound webhook only sends metadata — fetch full content via API
  let rawHtml = ''
  let rawText = ''
  if (emailId && process.env.RESEND_API_KEY) {
    try {
      const emailRes = await fetch(`https://api.resend.com/emails/${emailId}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      })
      if (emailRes.ok) {
        const emailData = await emailRes.json() as Record<string, unknown>
        rawHtml = (emailData.html as string) ?? ''
        rawText = (emailData.text as string) ?? ''
      } else {
        console.error('[email-inbound] failed to fetch email content, status:', emailRes.status)
      }
    } catch (err) {
      console.error('[email-inbound] error fetching email content:', err)
    }
  }

  // Prefer HTML, strip quoted content, fall back to plain text
  const body = rawHtml
    ? stripQuotedReply(rawHtml)
    : rawText
      ? rawText.split(/\n>{1,}|\nOn .+wrote:/)[0].replace(/\n/g, '<br>').trim() || rawText.replace(/\n/g, '<br>')
      : ''

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
