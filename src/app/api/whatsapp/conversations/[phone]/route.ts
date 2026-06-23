import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/whatsapp'

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
  if ('bot_active' in body) {
    updates.bot_active = body.bot_active
    // Manually flipping the bot back on always restarts the qualifying flow.
    if (body.bot_active) updates.bot_phase = 'qualifying'
    updates.bot_next_question = null
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await admin
    .from('whatsapp_conversations')
    .update(updates)
    .eq('phone_number', normalized)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
