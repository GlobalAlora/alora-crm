import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPassword, createSession, PORTAL_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/portal-auth'

export async function POST(req: NextRequest) {
  const { email, password, nombre, empresa } = await req.json()

  if (!email?.trim() || !password || !nombre?.trim()) {
    return NextResponse.json({ error: 'Email, contraseña y nombre son requeridos' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('portal_clients')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'Ya existe una cuenta con ese email' }, { status: 409 })
  }

  const passwordHash = await hashPassword(password)

  const { data: client, error } = await admin
    .from('portal_clients')
    .insert({
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      nombre: nombre.trim(),
      empresa: empresa?.trim() || null,
    })
    .select('id, email, nombre, empresa')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sessionId = await createSession(client.id)

  const res = NextResponse.json({ data: client }, { status: 201 })
  res.cookies.set(PORTAL_COOKIE, sessionId, SESSION_COOKIE_OPTIONS)
  return res
}
