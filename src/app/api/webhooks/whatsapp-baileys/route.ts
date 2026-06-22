import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordInboundWhatsAppMessage } from '@/lib/whatsapp-inbound'

// ── POST /api/webhooks/whatsapp-baileys ────────────────────────────────────────
// Called by the Baileys worker (a separate always-on Node process) for every
// inbound WhatsApp message it receives.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (!secret || secret !== process.env.BAILEYS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as {
    phone?: string
    name?: string | null
    text?: string | null
    waMessageId?: string | null
    mediaType?: string | null
  } | null

  if (!body?.phone) {
    return NextResponse.json({ error: 'phone es requerido' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    await recordInboundWhatsAppMessage(admin, {
      phone:       body.phone,
      name:        body.name ?? null,
      text:        body.text ?? null,
      waMessageId: body.waMessageId ?? null,
      mediaType:   body.mediaType ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[WhatsApp Baileys] Failed to process message:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok' })
}
