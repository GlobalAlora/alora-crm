import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/whatsapp'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'

type Params = { params: Promise<{ phone: string }> }

// GET /api/whatsapp/conversations/[phone]
// Returns all wa_messages for this conversation, ordered ascending (chat timeline)
export async function GET(_req: NextRequest, { params }: Params) {
  const { phone } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const normalized = normalizePhone(phone)

  // Get conversation by phone
  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('id')
    .eq('phone_number', normalized)
    .maybeSingle()

  if (!conv) {
    // No conversation yet — return empty (new chat initiated from CRM)
    return NextResponse.json({ data: [] })
  }

  const { data, error } = await admin
    .from('wa_messages')
    .select('*')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, conversation_id: conv.id })
}

// PATCH /api/whatsapp/conversations/[phone]
// Mark as read (unread_count → 0) or update status (open/closed)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { phone } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const normalized = normalizePhone(phone)
  const body = await req.json() as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  if ('unread_count' in body) updates.unread_count = body.unread_count
  if ('status' in body) updates.status = body.status
  const reactivatingBot = 'bot_active' in body && body.bot_active === true

  if ('bot_active' in body) {
    updates.bot_active = body.bot_active
    // On reactivation: restart qualifying from scratch so the bot is in a known state.
    // On pause: clear the pending question.
    if (body.bot_active) {
      // Use 'faq' when reactivating an existing conversation: the qualifying
      // "fresh start" branch would detect prior outbound messages and silently
      // switch to faq anyway, skipping a response to the lead's pending message.
      updates.bot_phase = 'faq'
      updates.bot_next_question = null
    } else {
      updates.bot_next_question = null
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await admin
    .from('whatsapp_conversations')
    .update(updates)
    .eq('phone_number', normalized)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // When Lidia is manually reactivated, send a re-engagement message immediately
  // so the lead doesn't have to write again.
  if (reactivatingBot) {
    const { data: conv } = await admin
      .from('whatsapp_conversations')
      .select('id, lead_id')
      .eq('phone_number', normalized)
      .maybeSingle()

    if (conv?.lead_id) {
      const { data: lead } = await admin
        .from('leads')
        .select('nombre')
        .eq('id', conv.lead_id)
        .maybeSingle()

      const nombre = lead?.nombre && !lead.nombre.startsWith('+') ? `, ${lead.nombre.split(' ')[0]}` : ''

      await sendOutboundWhatsAppMessage(admin, {
        conversationId: conv.id,
        leadId:         conv.lead_id,
        phone:          normalized,
        body:           `¡Hola${nombre}! 👋 Soy Lidia, de Alora. ¿En qué te puedo ayudar hoy?`,
      }).catch(err => console.error('[Bot-reactivate] send error:', err))
    }
  }

  return NextResponse.json({ success: true })
}
