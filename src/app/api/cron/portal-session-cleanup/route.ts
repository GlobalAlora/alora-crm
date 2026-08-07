/**
 * Daily cron — elimina sesiones de portal vencidas.
 * Schedule: 0 3 * * * (3am UTC = medianoche Argentina)
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { error, count } = await admin
    .from('portal_sessions')
    .delete({ count: 'exact' })
    .lt('expires_at', new Date().toISOString())

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: count ?? 0 })
}
