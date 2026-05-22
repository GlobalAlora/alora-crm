import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractMessages, normalizePhone, type WhatsAppPayload } from '@/lib/whatsapp'

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

  // ── Deduplication: skip if already stored ────────────────────────────────
  if (waMessageId) {
    const { data: existing } = await admin
      .from('wa_messages')
      .select('id')
      .eq('wa_message_id', waMessageId)
      .maybeSingle()

    if (existing) {
      console.log(`[WhatsApp] Duplicate message ignored: ${waMessageId}`)
      return
    }
  }

  // ── 1. Find or create lead ────────────────────────────────────────────────
  const leadId = await findOrCreateLead({ admin, phone: normalizedPhone, name, text })

  // ── 2. Upsert conversation, get conversation_id ───────────────────────────
  const previewText = text
    ? (text.length > 100 ? text.slice(0, 100) + '…' : text)
    : '[Mensaje de WhatsApp]'

  const { data: convId, error: convError } = await admin
    .rpc('upsert_wa_conversation', {
      p_phone:     normalizedPhone,
      p_lead_id:   leadId,
      p_last_text: previewText,
    })

  if (convError || !convId) {
    console.error(`[WhatsApp] upsert_wa_conversation failed:`, convError?.message)
    return
  }

  // ── 3. Save message to wa_messages ────────────────────────────────────────
  const { error: msgError } = await admin
    .from('wa_messages')
    .insert({
      conversation_id: convId,
      lead_id:         leadId,
      direction:       'inbound',
      body:            text,
      wa_message_id:   waMessageId ?? null,
      status:          'read',   // inbound messages are already "read" by the sender
      media_type:      (raw?.type as string) !== 'text' ? (raw?.type as string) : null,
    })

  if (msgError) {
    console.error(`[WhatsApp] Failed to save message from ${normalizedPhone}:`, msgError.message)
  } else {
    console.log(`[WhatsApp] Message saved from ${normalizedPhone}`)
  }
}

// ── Find or create lead ───────────────────────────────────────────────────────

async function findOrCreateLead({
  admin,
  phone,
  name,
  text,
}: {
  admin: ReturnType<typeof createAdminClient>
  phone: string
  name: string | null
  text: string | null
}): Promise<string> {
  // Search by phone (with or without leading +)
  const { data: existing } = await admin
    .from('leads')
    .select('id, nombre')
    .or(`telefono.eq.${phone},telefono.eq.+${phone}`)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (existing) {
    console.log(`[WhatsApp] Existing lead: ${existing.id} (${existing.nombre})`)
    return existing.id
  }

  // Round-robin assignment to agent with fewest active leads
  const { data: salesUsers } = await admin
    .from('users')
    .select('id')
    .in('role', ['admin', 'sales'])

  let responsableId: string | null = null
  if (salesUsers && salesUsers.length > 0) {
    const counts = await Promise.all(
      salesUsers.map(async (u) => {
        const { count } = await admin
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('responsable_id', u.id)
          .is('deleted_at', null)
          .not('estado_pipeline', 'in', '(cliente_ganado,cliente_perdido,no_cualificado)')
        return { id: u.id, count: count ?? 0 }
      })
    )
    counts.sort((a, b) => a.count - b.count)
    responsableId = counts[0].id
  }

  const { data: maxPos } = await admin
    .from('leads')
    .select('kanban_position')
    .eq('estado_pipeline', 'lead_entrante')
    .is('deleted_at', null)
    .order('kanban_position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: newLead, error } = await admin
    .from('leads')
    .insert({
      nombre:          name || 'Contacto WhatsApp',
      telefono:        phone,
      fuente:          'whatsapp',
      estado_pipeline: 'lead_entrante',
      kanban_position: (maxPos?.kanban_position ?? 0) + 1,
      responsable_id:  responsableId,
      created_by:      responsableId,
      notas:           text ? `Primer mensaje: ${text}` : null,
    })
    .select('id, nombre')
    .single()

  if (error || !newLead) {
    throw new Error(`Failed to create lead: ${error?.message ?? 'unknown'}`)
  }

  console.log(`[WhatsApp] New lead created: ${newLead.id} (${newLead.nombre})`)
  return newLead.id
}
