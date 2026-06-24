import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runWhatsAppFollowUps } from '@/lib/whatsapp-followup'

// ── GET /api/cron/whatsapp-followups ───────────────────────────────────────────
// Triggered daily by Vercel Cron (see vercel.json). Vercel signs the request
// with `Authorization: Bearer ${CRON_SECRET}` when that env var is set.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const result = await runWhatsAppFollowUps(admin)

  return NextResponse.json({ status: 'ok', ...result })
}
