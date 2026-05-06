/**
 * Resend Inbound Email Webhook
 *
 * Setup required (one-time, in Resend dashboard + DNS):
 * 1. In your DNS provider, add MX records for a subdomain (e.g. reply.globalalora.com):
 *    - MX  10  inbound.resend.com
 * 2. In Resend → Domains → globalalora.com → Inbound, add the subdomain and
 *    point the webhook URL to: https://alora-crm.vercel.app/api/webhooks/email-inbound
 *
 * When a lead replies to an email, Resend parses it and POSTs the payload here.
 * We match the sender's email to a lead and log the reply as an inbound activity.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface ResendInboundPayload {
  from: string        // e.g. "Juan García <juan@empresa.com>"
  to: string[]        // e.g. ["reply@globalalora.com"]
  subject: string
  html?: string
  text?: string
  headers?: Record<string, string>
}

function extractEmail(raw: string): string {
  // "Name <email@domain.com>" → "email@domain.com"
  const match = raw.match(/<([^>]+)>/)
  return match ? match[1].toLowerCase() : raw.toLowerCase().trim()
}

export async function POST(req: NextRequest) {
  let payload: ResendInboundPayload

  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const senderEmail = extractEmail(payload.from ?? '')
  if (!senderEmail) {
    return NextResponse.json({ error: 'No sender email' }, { status: 400 })
  }

  const adminSupabase = createAdminClient()

  // Find lead by email
  const { data: lead } = await adminSupabase
    .from('leads')
    .select('id, nombre, apellido')
    .ilike('email', senderEmail)
    .maybeSingle()

  if (!lead) {
    // No lead found — just acknowledge without logging
    return NextResponse.json({ ok: true, note: 'No matching lead' })
  }

  const senderName = [lead.nombre, lead.apellido].filter(Boolean).join(' ')
  const subject = payload.subject ?? '(sin asunto)'
  const body = payload.html ?? payload.text?.replace(/\n/g, '<br>') ?? ''

  // Strip quoted reply text (everything after "-- " or "El ... escribió:")
  const cleanBody = body
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()

  await adminSupabase.from('activities').insert({
    lead_id: lead.id,
    user_id: null,   // inbound — no CRM user sent this
    tipo: 'email',
    descripcion: `<strong>Respuesta de ${senderName}:</strong><br><strong>Asunto:</strong> ${subject}<br><br>${cleanBody || body}`,
    metadata: {
      direction: 'inbound',
      from: senderEmail,
      from_name: senderName,
      subject,
    },
  })

  return NextResponse.json({ ok: true })
}
