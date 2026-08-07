import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_ROLES = ['admin', 'sales']
type Params = { params: Promise<{ id: string }> }

async function requireCrm() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', status: 401 as const }
  const admin = createAdminClient()
  const { data } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(data?.role ?? '')) return { error: 'Sin permisos', status: 403 as const }
  return { admin }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const auth = await requireCrm()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await auth.admin.from('quick_replies').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
