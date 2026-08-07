import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyPassword, createSession, PORTAL_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/portal-auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email?.trim() || !password) {
    return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: client } = await admin
    .from('portal_clients')
    .select('id, email, nombre, empresa, password_hash')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle()

  if (!client) {
    return NextResponse.json({ error: 'Email o contraseña incorrectos' }, { status: 401 })
  }

  const valid = await verifyPassword(password, client.password_hash)
  if (!valid) {
    return NextResponse.json({ error: 'Email o contraseña incorrectos' }, { status: 401 })
  }

  const sessionId = await createSession(client.id)

  const res = NextResponse.json({
    data: { id: client.id, email: client.email, nombre: client.nombre, empresa: client.empresa },
  })
  res.cookies.set(PORTAL_COOKIE, sessionId, SESSION_COOKIE_OPTIONS)
  return res
}
