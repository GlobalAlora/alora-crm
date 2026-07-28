// Mark all unread inbound emails (optionally for a specific lead) as read
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { lead_id } = await req.json().catch(() => ({})) as { lead_id?: string }

  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = (admin as any)
    .from('activities')
    .update({ read_at: new Date().toISOString() })
    .eq('tipo', 'email')
    .is('read_at', null)
    .eq('metadata->>direction', 'inbound')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (lead_id ? (base as any).eq('lead_id', lead_id) : base)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
