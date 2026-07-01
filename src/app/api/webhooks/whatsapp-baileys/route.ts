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
    direction?: 'inbound' | 'outbound'   // outbound = sent from native WA app by the team
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

  // Outbound message detected by the Baileys worker (fromMe=true).
  // Could be (a) the team writing from the native WA app → pause the bot,
  // or (b) the CRM/bot sending via the worker → just an echo, skip it.
  // The CRM always records its own messages in wa_messages with wa_message_id,
  // so if the id is already there, this is Lidia's own echo — don't pause.
  if (body.direction === 'outbound') {
    try {
      const phone = body.phone.replace(/\D/g, '')

      if (body.waMessageId) {
        const { count: alreadyRecorded } = await admin
          .from('wa_messages')
          .select('id', { count: 'exact', head: true })
          .eq('wa_message_id', body.waMessageId)
        if (alreadyRecorded && alreadyRecorded > 0) {
          console.log(`[Bot] SKIP outbound echo waMessageId=${body.waMessageId} (CRM-sent)`)
          return NextResponse.json({ status: 'ok' })
        }
      }

      const { data: conv } = await admin
        .from('whatsapp_conversations')
        .select('id')
        .eq('phone_number', phone)
        .maybeSingle()

      if (conv) {
        await admin.from('wa_messages').insert({
          conversation_id: conv.id,
          lead_id:         null,
          direction:       'outbound',
          body:            body.text ?? null,
          wa_message_id:   body.waMessageId ?? null,
          status:          'sent',
        }).throwOnError()
        await admin.from('whatsapp_conversations')
          .update({ bot_active: false, last_message_direction: 'outbound', last_message_at: new Date().toISOString() })
          .eq('id', conv.id)
        console.log(`[Bot] PAUSE reason=native_wa_outbound phone=${phone}`)
      }
    } catch (err) {
      console.error('[WhatsApp Baileys] Failed to record outbound message:', err)
    }
    return NextResponse.json({ status: 'ok' })
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
