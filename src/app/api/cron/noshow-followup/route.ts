import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runNoshowFollowups } from '@/lib/noshow-followup'

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const result = await runNoshowFollowups(admin)
  return NextResponse.json({ status: 'ok', ...result })
}
