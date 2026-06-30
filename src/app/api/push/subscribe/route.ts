import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — register a push subscription for the logged-in user
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { endpoint, keys } = body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Datos de suscripción inválidos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('push_subscriptions').upsert({
    user_id:    user.id,
    endpoint,
    p256dh:     keys.p256dh,
    auth_key:   keys.auth,
    user_agent: req.headers.get('user-agent') ?? null,
  }, { onConflict: 'endpoint' })

  if (error) {
    console.error('[Push] Failed to save subscription:', error.message)
    return NextResponse.json({ error: 'Error al guardar suscripción' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE — remove a push subscription
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { endpoint } = await req.json() as { endpoint?: string }
  if (!endpoint) return NextResponse.json({ error: 'Falta endpoint' }, { status: 400 })

  const admin = createAdminClient()
  await admin.from('push_subscriptions').delete()
    .eq('user_id', user.id).eq('endpoint', endpoint)

  return NextResponse.json({ ok: true })
}
