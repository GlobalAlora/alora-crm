import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BILLING_ROLES = ['admin', 'sales']

export async function requireBillingAccess(): Promise<
  | { user: { id: string }; admin: ReturnType<typeof createAdminClient>; error: null }
  | { user: null; admin: null; error: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, admin: null, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (!BILLING_ROLES.includes(row?.role ?? '')) {
    return { user: null, admin: null, error: NextResponse.json({ error: 'Sin acceso a facturación' }, { status: 403 }) }
  }

  return { user: { id: user.id }, admin, error: null }
}
