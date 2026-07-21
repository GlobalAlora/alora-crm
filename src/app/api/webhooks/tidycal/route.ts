import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processTidyCalBooking } from '@/lib/tidycal'

// TidyCal doesn't support native webhooks as of 2026. This route is kept for
// future use or if forwarding via Make/Zapier.
// Configure the webhook URL in TidyCal → Settings → Webhooks:
//   https://alora-crm.vercel.app/api/webhooks/tidycal?secret=YOUR_SECRET
// Set TIDYCAL_WEBHOOK_SECRET in Vercel env vars.

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.TIDYCAL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  if (body.event !== 'booking.created') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const b = body.booking ?? {}
  const contact = b.contact ?? {}

  // TidyCal can include extra questions — look for a phone answer
  const phone: string | null = (() => {
    const questions: { label?: string; answer?: string }[] = b.questions ?? []
    const phoneQ = questions.find((q) => /phone|tel[eé]fono|tel\b/i.test(q.label ?? ''))
    return phoneQ?.answer?.trim() || null
  })()

  const admin = createAdminClient()
  const { result, reason } = await processTidyCalBooking(admin, {
    id:             b.id,
    name:           contact.name?.trim() || 'Sin nombre',
    email:          contact.email?.trim() || null,
    phone,
    starts_at:      b.start ?? b.starts_at,
    status:         'active',
    booking_type:   b.booking_type ?? null,
    note:           b.note?.trim() || null,
    cancel_url:     b.cancel_url ?? null,
    reschedule_url: b.reschedule_url ?? null,
  })

  if (result === 'error') {
    console.error('[TidyCal webhook] Error:', reason)
    return NextResponse.json({ error: reason }, { status: 422 })
  }

  return NextResponse.json({ ok: true, result, reason }, { status: result === 'processed' ? 201 : 200 })
}
