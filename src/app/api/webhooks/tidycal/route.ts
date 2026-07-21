import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNewLeadAlert } from '@/lib/lead-alerts'

// TidyCal sends booking events when someone books via the embedded calendar.
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

  // Only handle new bookings
  if (body.event !== 'booking.created') {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const booking = body.booking ?? {}
  const contact = booking.contact ?? {}

  const nombre: string = contact.name?.trim() || 'Sin nombre'
  const email: string | null = contact.email?.trim() || null

  // TidyCal can include extra questions — look for a phone answer
  const phone: string | null = (() => {
    const questions: { label?: string; answer?: string }[] = booking.questions ?? []
    const phoneQ = questions.find((q) =>
      /phone|tel[eé]fono|tel\b/i.test(q.label ?? '')
    )
    return phoneQ?.answer?.trim() || null
  })()

  const startTime: string | null = booking.start ?? null
  const note: string | null = booking.note?.trim() || null

  if (!email && !phone) {
    return NextResponse.json({ error: 'Sin email ni teléfono — no se puede crear lead' }, { status: 422 })
  }

  const supabase = createAdminClient()

  // Test booking: discard silently
  if (nombre.toLowerCase() === 'prueba') {
    return NextResponse.json({ ok: true, test: true })
  }

  // Dedup: reuse existing lead by email or phone
  const conditions: string[] = []
  if (email) conditions.push(`email.eq.${email}`)
  if (phone) conditions.push(`telefono.eq.${phone}`)

  const { data: existing } = await supabase
    .from('leads')
    .select('id, nombre')
    .or(conditions.join(','))
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Lead already exists — just log the booking as an activity
    await supabase.from('activities').insert({
      lead_id: existing.id,
      user_id: null,
      tipo: 'reunion',
      descripcion: `Llamada de relevamiento agendada via TidyCal${startTime ? ` — ${new Date(startTime).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}` : ''}`,
      metadata: { booking_id: booking.id, start: startTime, note },
    })
    return NextResponse.json({ ok: true, lead_id: existing.id, duplicate: true })
  }

  // Assign to Walo
  const { data: walo } = await supabase
    .from('users')
    .select('id')
    .eq('email', 'somosglobalalora@gmail.com')
    .maybeSingle()

  const responsableId: string | null = walo?.id ?? null

  const { data: maxPos } = await supabase
    .from('leads')
    .select('kanban_position')
    .eq('estado_pipeline', 'lead_entrante')
    .is('deleted_at', null)
    .order('kanban_position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      nombre,
      email,
      telefono: phone,
      fuente: 'calendario',
      estado_pipeline: 'lead_entrante',
      kanban_position: (maxPos?.kanban_position ?? 0) + 1,
      responsable_id: responsableId,
      created_by: responsableId,
      notas: note ?? (startTime ? `Llamada agendada: ${new Date(startTime).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}` : null),
    })
    .select('id, nombre')
    .single()

  if (error) {
    // Race condition: re-query if unique violation
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('leads')
        .select('id')
        .or(conditions.join(','))
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()
      if (raced) return NextResponse.json({ ok: true, lead_id: raced.id, duplicate: true })
    }
    console.error('[TidyCal] Error al crear lead:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('activities').insert({
    lead_id: lead.id,
    user_id: null,
    tipo: 'reunion',
    descripcion: `Llamada de relevamiento agendada via TidyCal${startTime ? ` — ${new Date(startTime).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}` : ''}`,
    metadata: { booking_id: booking.id, start: startTime, note },
  })

  await sendNewLeadAlert({
    id: lead.id,
    nombre,
    email,
    telefono: phone,
    empresa: null,
    pais: null,
    fuente: 'calendario',
    mensaje: note ?? null,
  })

  return NextResponse.json({ ok: true, lead_id: lead.id }, { status: 201 })
}
