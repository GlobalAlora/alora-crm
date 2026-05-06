/**
 * Inbound Email Webhook
 *
 * Handles inbound emails from Postmark (primary) or Resend (fallback).
 * Postmark sends the full email body including StrippedTextReply.
 * Resend sends only metadata (email_id, from, subject) without body.
 *
 * Postmark inbound docs: https://postmarkapp.com/developer/user-guide/inbound
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface PostmarkInbound {
  From: string
  FromName?: string
  Subject?: string
  HtmlBody?: string
  TextBody?: string
  StrippedTextReply?: string
}

interface ResendInboundData {
  from?: string
  subject?: string
  email_id?: string
  html?: string
  text?: string
}

interface ResendInbound {
  type?: string
  data?: ResendInboundData
  from?: string
  subject?: string
  html?: string
  text?: string
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

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function stripQuotedReply(html: string): string {
  let stripped = html
    .replace(/<div class="gmail_quote"[\s\S]*$/i, '')
    .replace(/<div id="divRplyFwdMsg"[\s\S]*$/i, '')  // Outlook
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()

  if (!stripped || stripHtmlTags(stripped) === '') return html
  return stripped
}

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Detect Postmark vs Resend by checking for Postmark-specific fields
  const isPostmark = typeof payload?.From === 'string' || typeof payload?.Subject === 'string'

  let fromRaw = ''
  let subject = '(sin asunto)'
  let htmlBody = ''
  let textBody = ''

  if (isPostmark) {
    const pm = payload as PostmarkInbound
    fromRaw = pm.From ?? ''
    subject = pm.Subject ?? '(sin asunto)'
    htmlBody = pm.HtmlBody ?? ''
    // StrippedTextReply is the reply content without quoted history — perfect
    textBody = pm.StrippedTextReply ?? pm.TextBody ?? ''
  } else {
    const rs = payload as ResendInbound
    const data = rs.data ?? rs
    fromRaw = data.from ?? ''
    subject = data.subject ?? '(sin asunto)'
    htmlBody = data.html ?? ''
    textBody = data.text ?? ''
  }

  const senderEmail = extractEmail(fromRaw)
  const senderDisplayName = isPostmark
    ? ((payload as PostmarkInbound).FromName ?? extractName(fromRaw))
    : extractName(fromRaw)

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
    return NextResponse.json({ ok: true, note: 'No matching lead for ' + senderEmail })
  }

  const leadName = senderDisplayName ||
    [lead.nombre, lead.apellido].filter(Boolean).join(' ') ||
    senderEmail

  // Build body: prefer stripped HTML, fallback to text, fallback to full html
  let body = ''
  if (htmlBody) {
    body = stripQuotedReply(htmlBody)
  } else if (textBody) {
    body = textBody.replace(/\n/g, '<br>')
  }

  await adminSupabase.from('activities').insert({
    lead_id: lead.id,
    user_id: null,
    tipo: 'email',
    descripcion: [
      `<strong>✉ Respuesta de ${leadName}</strong>`,
      `<span style="color:#64748b;font-size:12px">Asunto: ${subject}</span>`,
      '',
      body || '(mensaje vacío)',
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
