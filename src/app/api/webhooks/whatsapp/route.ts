import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractMessages, normalizePhone, type WhatsAppPayload } from '@/lib/whatsapp'
import { recordInboundWhatsAppMessage } from '@/lib/whatsapp-inbound'

// ── GET — Meta webhook verification challenge ─────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const admin = createAdminClient()
  const { data: cfg } = await admin
    .from('channel_configs')
    .select('verify_token')
    .eq('channel_type', 'whatsapp')
    .eq('label', 'Principal')
    .single()

  const verifyToken = cfg?.verify_token || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  if (!verifyToken) {
    console.error('[WhatsApp] WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set')
    return new NextResponse('Server configuration error', { status: 500 })
  }

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WhatsApp] Webhook verified successfully')
    return new NextResponse(challenge, { status: 200 })
  }

  console.warn('[WhatsApp] Webhook verification failed', { mode, token })
  return new NextResponse('Forbidden', { status: 403 })
}

// ── POST — incoming events ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: WhatsAppPayload

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Meta expects 200 immediately — process async
  processPayload(body).catch((err) => {
    console.error('[WhatsApp] Error processing payload:', err)
  })

  return NextResponse.json({ status: 'ok' }, { status: 200 })
}

// ── Core processing ───────────────────────────────────────────────────────────

async function processPayload(payload: WhatsAppPayload) {
  if (payload.object !== 'whatsapp_business_account') return

  const admin = createAdminClient()

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue

      const value = change.value

      // ── Handle status updates (delivered / read) ──────────────────────────
      for (const statusUpdate of (value.statuses as Record<string, unknown>[] | undefined) ?? []) {
        await handleStatusUpdate(admin, statusUpdate)
      }

      // ── Handle incoming messages ──────────────────────────────────────────
      const incoming = extractMessages(payload)
      for (const { phone, name, text, rawMessage } of incoming) {
        await handleIncomingMessage({ admin, phone, name, text, rawMessage })
      }
    }
  }

  // Update last_message_at in channel config
  await admin
    .from('channel_configs')
    .update({ last_message_at: new Date().toISOString(), last_error: null })
    .eq('channel_type', 'whatsapp')
    .eq('label', 'Principal')
}

// ── Status update handler ─────────────────────────────────────────────────────

async function handleStatusUpdate(
  admin: ReturnType<typeof createAdminClient>,
  statusUpdate: Record<string, unknown>,
) {
  const waMessageId = statusUpdate.id as string | undefined
  const status      = statusUpdate.status as string | undefined

  if (!waMessageId || !status) return

  // Only track meaningful transitions
  const validStatuses = ['sent', 'delivered', 'read', 'failed']
  if (!validStatuses.includes(status)) return

  const { error } = await admin
    .from('wa_messages')
    .update({ status, status_updated_at: new Date().toISOString() })
    .eq('wa_message_id', waMessageId)

  if (error) {
    console.error(`[WhatsApp] Failed to update status for ${waMessageId}:`, error.message)
  } else {
    console.log(`[WhatsApp] Status updated: ${waMessageId} → ${status}`)
  }
}

// ── Incoming message handler ──────────────────────────────────────────────────

interface IncomingParams {
  admin: ReturnType<typeof createAdminClient>
  phone: string
  name: string | null
  text: string | null
  rawMessage: unknown
}

async function handleIncomingMessage({ admin, phone, name, text, rawMessage }: IncomingParams) {
  const normalizedPhone = normalizePhone(phone)
  const raw = rawMessage as Record<string, unknown>
  const waMessageId = raw?.id as string | undefined

  await recordInboundWhatsAppMessage(admin, {
    phone:        normalizedPhone,
    name,
    text,
    waMessageId:  waMessageId ?? null,
    mediaType:    (raw?.type as string) !== 'text' ? (raw?.type as string) : null,
  })
}
