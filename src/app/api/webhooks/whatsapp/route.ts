import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractMessages, normalizePhone, type WhatsAppPayload } from '@/lib/whatsapp'

// ── GET — Meta webhook verification challenge ─────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

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

  // Meta expects a 200 immediately — process async
  processPayload(body).catch((err) => {
    console.error('[WhatsApp] Error processing payload:', err)
  })

  return NextResponse.json({ status: 'ok' }, { status: 200 })
}

// ── Core processing ───────────────────────────────────────────────────────────

async function processPayload(payload: WhatsAppPayload) {
  if (payload.object !== 'whatsapp_business_account') {
    console.log('[WhatsApp] Ignoring non-WhatsApp event:', payload.object)
    return
  }

  const supabase = createAdminClient()
  const messages = extractMessages(payload)

  if (messages.length === 0) {
    console.log('[WhatsApp] No incoming messages in payload (status update or empty)')
    return
  }

  for (const { phone, name, text, rawMessage, rawValue } of messages) {
    console.log(`[WhatsApp] Message from ${phone} (${name ?? 'unknown'}): ${text ?? '[non-text]'}`)

    try {
      await upsertLeadAndActivity({ supabase, phone, name, text, rawMessage, rawValue })
    } catch (err) {
      console.error(`[WhatsApp] Failed to process message from ${phone}:`, err)
    }
  }
}

interface UpsertParams {
  supabase: ReturnType<typeof createAdminClient>
  phone: string
  name: string | null
  text: string | null
  rawMessage: unknown
  rawValue: unknown
}

async function upsertLeadAndActivity({ supabase, phone, name, text, rawMessage, rawValue }: UpsertParams) {
  // ── 1. Look up existing lead by phone ──────────────────────────────────────
  const normalizedPhone = normalizePhone(phone)

  const { data: existing } = await supabase
    .from('leads')
    .select('id, nombre, estado_pipeline')
    .or(`telefono.eq.${normalizedPhone},telefono.eq.+${normalizedPhone}`)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  let leadId: string

  if (existing) {
    // ── 2a. Lead exists — just use it ──────────────────────────────────────
    leadId = existing.id
    console.log(`[WhatsApp] Existing lead found: ${existing.id} (${existing.nombre})`)
  } else {
    // ── 2b. Create new lead ────────────────────────────────────────────────
    const { data: maxPos } = await supabase
      .from('leads')
      .select('kanban_position')
      .eq('estado_pipeline', 'lead_entrante')
      .is('deleted_at', null)
      .order('kanban_position', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Round-robin: pick sales user with fewest active leads
    const { data: salesUsers } = await supabase
      .from('users')
      .select('id')
      .in('role', ['admin', 'sales'])

    let responsableId: string | null = null
    if (salesUsers && salesUsers.length > 0) {
      const counts = await Promise.all(
        salesUsers.map(async (u) => {
          const { count } = await supabase
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

    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        nombre: name || 'Contacto WhatsApp',
        telefono: normalizedPhone,
        fuente: 'whatsapp',
        estado_pipeline: 'lead_entrante',
        kanban_position: (maxPos?.kanban_position ?? 0) + 1,
        responsable_id: responsableId,
        created_by: responsableId,
        notas: text ? `Primer mensaje: ${text}` : null,
      })
      .select('id, nombre')
      .single()

    if (error || !newLead) {
      throw new Error(`Failed to create lead: ${error?.message ?? 'unknown'}`)
    }

    leadId = newLead.id
    console.log(`[WhatsApp] New lead created: ${newLead.id} (${newLead.nombre})`)
  }

  // ── 3. Create activity ─────────────────────────────────────────────────────
  const description = text
    ? text.length > 200 ? text.slice(0, 200) + '…' : text
    : '[Mensaje no-texto recibido por WhatsApp]'

  const { error: actError } = await supabase
    .from('activities')
    .insert({
      lead_id: leadId,
      user_id: null,
      tipo: 'whatsapp',
      descripcion: description,
      metadata: {
        source: 'whatsapp_webhook',
        direction: 'inbound',
        phone: normalizedPhone,
        text: text ?? null,
        message_id: (rawMessage as Record<string, unknown>)?.id ?? null,
        message_type: (rawMessage as Record<string, unknown>)?.type ?? null,
        phone_number_id: (rawValue as Record<string, unknown>)?.metadata
          ? ((rawValue as Record<string, unknown>).metadata as Record<string, unknown>)?.phone_number_id
          : null,
        raw_message: rawMessage,
      },
    })

  if (actError) {
    console.error(`[WhatsApp] Failed to create activity for lead ${leadId}:`, actError.message)
  } else {
    console.log(`[WhatsApp] Activity created for lead ${leadId}`)
  }

  // ── 4. Upsert conversation record (atomic: insert or increment unread) ───────
  const previewText = text
    ? (text.length > 100 ? text.slice(0, 100) + '…' : text)
    : '[Mensaje de WhatsApp]'

  const { error: convError } = await supabase.rpc('upsert_wa_conversation', {
    p_phone: normalizedPhone,
    p_lead_id: leadId,
    p_last_text: previewText,
  })

  if (convError) {
    console.error(`[WhatsApp] Failed to upsert conversation for ${normalizedPhone}:`, convError.message)
  } else {
    console.log(`[WhatsApp] Conversation updated for ${normalizedPhone}`)
  }
}
