import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendLidiaWeeklyReport } from '@/lib/lidia-weekly-report'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  await sendLidiaWeeklyReport(admin)
  return NextResponse.json({ status: 'ok' })
}

// POST — disparo manual desde el CRM (requiere sesión admin)
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

  const admin = createAdminClient()
  await sendLidiaWeeklyReport(admin)
  return NextResponse.json({ status: 'ok' })
}
