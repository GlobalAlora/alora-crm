import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

  // Channel config state
  const { data: cfg } = await admin
    .from('channel_configs')
    .select('is_active, last_message_at, last_error, last_error_at, access_token, phone_number_id')
    .eq('channel_type', 'whatsapp')
    .eq('label', 'Principal')
    .single()

  // Message stats (last 24h)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: messages24h } = await admin
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', 'whatsapp')
    .gte('created_at', since24h)

  // Total conversations
  const { count: totalConversations } = await admin
    .from('whatsapp_conversations')
    .select('id', { count: 'exact', head: true })

  // Open conversations
  const { count: openConversations } = await admin
    .from('whatsapp_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')

  const isConfigured = !!(cfg?.access_token || process.env.WHATSAPP_ACCESS_TOKEN)
    && !!(cfg?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID)

  return NextResponse.json({
    status: {
      is_configured:       isConfigured,
      is_active:           cfg?.is_active ?? true,
      last_message_at:     cfg?.last_message_at ?? null,
      last_error:          cfg?.last_error ?? null,
      last_error_at:       cfg?.last_error_at ?? null,
      messages_last_24h:   messages24h ?? 0,
      total_conversations: totalConversations ?? 0,
      open_conversations:  openConversations ?? 0,
    }
  })
}
