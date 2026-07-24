import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('users')
    .select('id, full_name, avatar_url, role')
    .eq('id', user.id)
    .maybeSingle()

  return NextResponse.json({
    data: {
      id:         user.id,
      email:      user.email ?? '',
      full_name:  row?.full_name ?? user.email ?? 'Usuario',
      avatar_url: row?.avatar_url ?? null,
      role:       row?.role ?? 'viewer',
    },
  })
}
