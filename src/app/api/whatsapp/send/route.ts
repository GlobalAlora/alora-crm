import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/whatsapp'
import { sendViaBaileysWorker } from '@/lib/whatsapp-baileys-client'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { phone, message, conversation_id: rawConvId } = await req.json() as {
    phone: string
    message: string
    conversation_id?: string | null
  }

  if (!phone?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'phone y message son requeridos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const normalizedPhone = normalizePhone(phone)

  // Resolve or create conversation for this phone number
  let conversation_id = rawConvId ?? null
  let leadId: string | null = null

  if (conversation_id) {
    const { data: conv } = await admin
      .from('whatsapp_conversations')
      .select('lead_id')
      .eq('id', conversation_id)
      .single()
    leadId = conv?.lead_id ?? null
  } else {
    // First outbound message — create conversation (no lead yet, user can link later)
    const preview = message.length > 100 ? message.slice(0, 100) + '…' : message
    const { data: newConvId } = await admin
      .rpc('upsert_wa_conversation', {
        p_phone:     normalizedPhone,
        p_lead_id:   null,
        p_last_text: preview,
      })
    conversation_id = newConvId as string
  }

  // ── 1. Insert message with status 'sending' (optimistic) ─────────────────
  const { data: savedMsg, error: insertError } = await admin
    .from('wa_messages')
    .insert({
      conversation_id,
      lead_id:   leadId,
      direction: 'outbound',
      body:      message,
      status:    'sending',
      agent_id:  user.id,
    })
    .select('id')
    .single()

  if (insertError || !savedMsg) {
    console.error('[WhatsApp Send] Failed to save message:', insertError?.message)
    return NextResponse.json({ error: 'Error al guardar mensaje' }, { status: 500 })
  }

  // ── 2. Send via the Baileys worker ────────────────────────────────────────
  let waMessageId: string | null = null
  try {
    const result = await sendViaBaileysWorker({ to: normalizedPhone, body: message })
    waMessageId = result.id ?? null

    // Update to 'sent' with Baileys' message ID
    await admin
      .from('wa_messages')
      .update({
        status:           'sent',
        wa_message_id:    waMessageId,
        status_updated_at: new Date().toISOString(),
      })
      .eq('id', savedMsg.id)

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al enviar mensaje'
    console.error('[WhatsApp Send]', msg)

    // Mark as failed
    await admin
      .from('wa_messages')
      .update({ status: 'failed', error_message: msg, status_updated_at: new Date().toISOString() })
      .eq('id', savedMsg.id)

    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // ── 3. Update conversation last message ───────────────────────────────────
  const preview = message.length > 100 ? message.slice(0, 100) + '…' : message
  await admin
    .from('whatsapp_conversations')
    .update({
      last_message_at:   new Date().toISOString(),
      last_message_text: preview,
    })
    .eq('id', conversation_id)

  return NextResponse.json({ success: true, message_id: savedMsg.id })
}
