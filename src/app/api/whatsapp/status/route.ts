import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

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

  return NextResponse.json({
    status: {
      messages_last_24h:   messages24h ?? 0,
      total_conversations: totalConversations ?? 0,
      open_conversations:  openConversations ?? 0,
    }
  })
}
