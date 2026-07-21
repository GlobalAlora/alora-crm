import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runTidyCalSync } from '@/lib/tidycal'

// ── GET /api/cron/tidycal-sync ────────────────────────────────────────────────
// Polls TidyCal API for new bookings and syncs them into the CRM.
// Run hourly via cron-job.org (Vercel Hobby doesn't allow sub-daily crons).
// Required env: TIDYCAL_API_KEY
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const result = await runTidyCalSync(admin)

  return NextResponse.json({ status: 'ok', ...result })
}
