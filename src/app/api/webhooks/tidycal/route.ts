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

  // Normalize questions: webhook may use `label` instead of `question`
  const questions: Array<{ question: string; answer: string | number | string[] | null }> =
    (b.questions ?? []).map((q: Record<string, unknown>) => ({
      question: String(q.label ?? q.question ?? ''),
      answer:   (q.answer ?? null) as string | number | string[] | null,
    }))

  const admin = createAdminClient()
  const { result, reason } = await processTidyCalBooking(admin, {
    id:           b.id,
    cancelled_at: null, // webhook only fires on booking.created
    starts_at:    b.start ?? b.starts_at,
    meeting_url:  b.meeting_url ?? null,
    booking_type: b.booking_type ?? null,
    contact: {
      id:    contact.id ?? 0,
      email: contact.email?.trim() || null,
      name:  contact.name?.trim() || 'Sin nombre',
    },
    questions,
    cancel_url:     b.cancel_url ?? null,
    reschedule_url: b.reschedule_url ?? null,
  })

  if (result === 'error') {
    console.error('[TidyCal webhook] Error:', reason)
    return NextResponse.json({ error: reason }, { status: 422 })
  }

  return NextResponse.json({ ok: true, result, reason }, { status: result === 'processed' ? 201 : 200 })
}
