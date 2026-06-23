import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/whatsapp'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'

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

  const sent = await sendOutboundWhatsAppMessage(admin, {
    conversationId: conversation_id,
    leadId,
    phone: normalizedPhone,
    body: message,
    agentId: user.id,
  })

  if (!sent) {
    return NextResponse.json({ error: 'Error al enviar mensaje' }, { status: 502 })
  }

  // A human just replied — stop the qualifying bot from interjecting further.
  await admin
    .from('whatsapp_conversations')
    .update({ bot_active: false })
    .eq('id', conversation_id)

  return NextResponse.json({ success: true, message_id: sent.id })
}
