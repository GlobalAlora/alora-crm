import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordInboundWhatsAppMessage, resolveLidPhone } from '@/lib/whatsapp-inbound'
import { recordNativeOutboundWhatsAppMessage } from '@/lib/whatsapp-native-outbound'
import { sendWhatsAppDisconnectedAlert } from '@/lib/whatsapp-alerts'
import { transcribeAudio } from '@/lib/transcribe-audio'

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
    audioBase64?: string | null   // base64-encoded audio buffer (ptt / audio messages)
    audioMimetype?: string | null // e.g. "audio/ogg; codecs=opus"
    imageBase64?: string | null   // base64-encoded image buffer
    imageMimetype?: string | null // e.g. "image/jpeg"
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

  // Outbound message detected by the Baileys worker (fromMe=true): either the
  // team writing from the native WA app (record it + pause Lidia) or an echo of
  // a message the CRM itself sent (skipped).
  if (body.direction === 'outbound') {
    try {
      await recordNativeOutboundWhatsAppMessage(admin, {
        phone:       body.phone,
        text:        body.text ?? null,
        waMessageId: body.waMessageId ?? null,
        mediaType:   body.mediaType ?? null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      console.error('[WhatsApp Baileys] Failed to record outbound message:', message)
      // 5xx so the worker retries: losing this notification means Lidia never
      // learns a human took over and answers on top of them.
      return NextResponse.json({ error: message }, { status: 500 })
    }
    return NextResponse.json({ status: 'ok' })
  }

  // If the message is a voice note / audio, transcribe it before processing
  let inboundText = body.text ?? null
  if (!inboundText && body.audioBase64 && body.audioMimetype) {
    console.log('[WhatsApp] Audio message received — transcribing…')
    inboundText = await transcribeAudio(body.audioBase64, body.audioMimetype)
    if (inboundText) {
      console.log('[WhatsApp] Transcription OK — treating as text message')
    } else {
      console.log('[WhatsApp] Transcription returned empty — saving as audio without text')
    }
  }

  const { imageBase64, imageMimetype } = body
  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('id')
    .eq('phone_number', body.phone.replace(/\D/g, ''))
    .maybeSingle()
  const conversationId = conv?.id ?? null
  const waMessageId = body.waMessageId ?? null

  let mediaUrl: string | null = null
  if (imageBase64 && imageMimetype) {
    try {
      const adminForUpload = createAdminClient()
      const ext = (imageMimetype as string).split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
      const path = `images/${conversationId ?? waMessageId ?? Date.now()}.${ext}`
      const buffer = Buffer.from(imageBase64 as string, 'base64')
      await adminForUpload.storage.from('whatsapp-media').upload(path, buffer, { contentType: imageMimetype as string, upsert: true })
      const { data: { publicUrl } } = adminForUpload.storage.from('whatsapp-media').getPublicUrl(path)
      mediaUrl = publicUrl
    } catch (err) {
      console.error('[WhatsApp] image upload failed:', err)
    }
  }

  try {
    await recordInboundWhatsAppMessage(admin, {
      phone:       body.phone,
      name:        body.name ?? null,
      text:        inboundText,
      waMessageId: waMessageId,
      mediaType:   body.mediaType ?? null,
      mediaUrl,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[WhatsApp Baileys] Failed to process message:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ status: 'ok' })
}
