import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createSession } from '@/lib/portal-auth'
import { PORTAL_URL } from '@/lib/ticket-emails'

const ALLOWED_ROLES = ['admin', 'sales']
type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { data: client } = await admin
    .from('portal_clients')
    .select('id, nombre')
    .eq('id', id)
    .maybeSingle()

  if (!client) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  const sessionId = await createSession(client.id, { isAdminPreview: true })
  const url = `${PORTAL_URL}/api/portal/auth/impersonate?session=${sessionId}`

  return NextResponse.json({ url })
}
