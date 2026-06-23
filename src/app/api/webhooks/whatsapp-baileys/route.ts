import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordInboundWhatsAppMessage, resolveLidPhone } from '@/lib/whatsapp-inbound'
import { sendWhatsAppDisconnectedAlert } from '@/lib/whatsapp-alerts'

// ── POST /api/webhooks/whatsapp-baileys ────────────────────────────────────────
// Called by the Baileys worker (a separate always-on Node process) for every
// inbound WhatsApp message it receives, and whenever it resolves a contact's
// LID to their real phone number.
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
    lidResolved?: { oldPhone: string; newPhone: string }
    disconnected?: { reason: string }
  } | null

  if (!body) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (body.disconnected) {
    await sendWhatsAppDisconnectedAlert()
    return NextResponse.json({ status: 'ok' })
  }

  const admin = createAdminClient()

  if (body.lidResolved) {
    try {
      await resolveLidPhone(admin, body.lidResolved.oldPhone, body.lidResolved.newPhone)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      console.error('[WhatsApp Baileys] Failed to resolve LID phone:', message)
      return NextResponse.json({ error: message }, { status: 500 })
    }
    return NextResponse.json({ status: 'ok' })
  }

  if (!body.phone) {
    return NextResponse.json({ error: 'phone es requerido' }, { status: 400 })
  }

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
