import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppText, normalizePhone } from '@/lib/whatsapp'

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { phone, message, lead_id } = await req.json() as {
    phone: string
    message: string
    lead_id?: string | null
  }

  if (!phone?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'phone y message son requeridos' }, { status: 400 })
  }

  const accessToken  = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken || !phoneNumberId) {
    return NextResponse.json({ error: 'WhatsApp no configurado' }, { status: 500 })
  }

  const normalizedPhone = normalizePhone(phone)

  // ── 1. Send via Meta Cloud API ────────────────────────────────────────────
  try {
    await sendWhatsAppText({
      phoneNumberId,
      to: normalizedPhone,
      body: message,
      accessToken,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al enviar mensaje'
    console.error('[WhatsApp Send]', msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // ── 2. Save outbound activity ─────────────────────────────────────────────
  const admin = createAdminClient()

  const preview = message.length > 200 ? message.slice(0, 200) + '…' : message

  await admin
    .from('activities')
    .insert({
      lead_id:    lead_id ?? null,
      user_id:    user.id,
      tipo:       'whatsapp',
      descripcion: preview,
      metadata: {
        source:         'whatsapp_send',
        direction:      'outbound',
        phone:          normalizedPhone,
        text:           message,
        message_type:   'text',
        phone_number_id: phoneNumberId,
      },
    })

  // ── 3. Update conversation last message ───────────────────────────────────
  await admin
    .from('whatsapp_conversations')
    .update({
      last_message_at:   new Date().toISOString(),
      last_message_text: message.length > 100 ? message.slice(0, 100) + '…' : message,
    })
    .eq('phone_number', normalizedPhone)

  return NextResponse.json({ success: true })
}
