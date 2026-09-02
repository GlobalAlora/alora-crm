import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAll } from '@/lib/push-notify'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const vapidConfigured = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)

  const results = await notifyAll({
    title: '🔔 Test de notificación',
    body:  '¡Funciona! Las push notifications están activas.',
    url:   '/',
  })

  return NextResponse.json({ ok: true, vapidConfigured, results })
}
