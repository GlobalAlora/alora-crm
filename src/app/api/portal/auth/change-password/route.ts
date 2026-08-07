import { NextRequest, NextResponse } from 'next/server'
import { getPortalClient, hashPassword, verifyPassword, PORTAL_COOKIE } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get(PORTAL_COOKIE)?.value
  if (!sessionId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const client = await getPortalClient(sessionId)
  if (!client) return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 })

  const { current_password, new_password } = await req.json() as { current_password?: string; new_password?: string }

  if (!current_password || !new_password) {
    return NextResponse.json({ error: 'Contraseña actual y nueva son requeridas' }, { status: 400 })
  }
  if (new_password.length < 8) {
    return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('portal_clients')
    .select('password_hash')
    .eq('id', client.id)
    .single()

  if (!row?.password_hash) return NextResponse.json({ error: 'Error interno' }, { status: 500 })

  const valid = await verifyPassword(current_password, row.password_hash)
  if (!valid) return NextResponse.json({ error: 'La contraseña actual es incorrecta' }, { status: 400 })

  const newHash = await hashPassword(new_password)
  const { error } = await admin
    .from('portal_clients')
    .update({ password_hash: newHash })
    .eq('id', client.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
