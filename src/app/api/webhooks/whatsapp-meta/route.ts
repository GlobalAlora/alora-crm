import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordInboundWhatsAppMessage } from '@/lib/whatsapp-inbound'
import { sendWhatsAppDisconnectedAlert } from '@/lib/whatsapp-alerts'

// ── GET /api/webhooks/whatsapp-meta ────────────────────────────────────────────
// Meta sends a GET request to verify the webhook endpoint.
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get('hub.mode')
  const token     = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[Meta Webhook] Verified successfully')
    return new NextResponse(challenge, { status: 200 })
  }

  console.warn('[Meta Webhook] Verification failed', { mode, token })
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ── POST /api/webhooks/whatsapp-meta ───────────────────────────────────────────
// Meta posts every inbound message and status update here.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)

  if (!body || body.object !== 'whatsapp_business_account') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const admin = createAdminClient()

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue

      const value = change.value

      // Process each inbound message
      for (const msg of value.messages ?? []) {
        const fromPhone = (msg.from ?? '').replace(/\D/g, '')
        const waMessageId = msg.id ?? null

        // Find the contact name from the contacts array
        const contact = (value.contacts ?? []).find((c: { wa_id: string; profile?: { name?: string } }) => c.wa_id === msg.from)
        const name = contact?.profile?.name ?? null

        let text: string | null = null
        let mediaType: string | null = null

        if (msg.type === 'text') {
          text = msg.text?.body ?? null
        } else if (msg.type === 'image') {
          text = msg.image?.caption ?? null
          mediaType = 'image'
        } else if (msg.type === 'video') {
          text = msg.video?.caption ?? null
          mediaType = 'video'
        } else if (msg.type === 'document') {
          text = msg.document?.caption ?? null
          mediaType = 'document'
        } else if (msg.type === 'audio') {
          mediaType = 'audio'
        } else if (msg.type === 'sticker') {
          mediaType = 'sticker'
        } else {
          // Unsupported message type, skip
          continue
        }

        if (!text && !mediaType) continue

        try {
          await recordInboundWhatsAppMessage(admin, {
            phone:       fromPhone,
            name,
            text,
            waMessageId,
            mediaType,
          })
        } catch (err) {
          console.error('[Meta Webhook] Failed to process message:', err)
        }
      }

      // Log status updates (delivered, read, failed) — no action needed for now
      for (const status of value.statuses ?? []) {
        console.log(`[Meta Webhook] Status update: ${status.id} → ${status.status}`)
      }
    }
  }

  // Meta requires a 200 response quickly
  return NextResponse.json({ status: 'ok' })
}
