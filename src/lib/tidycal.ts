import { createAdminClient } from '@/lib/supabase/admin'
import { sendNewLeadAlert } from '@/lib/lead-alerts'

type AdminClient = ReturnType<typeof createAdminClient>

export interface TidyCalBooking {
  id: number
  name: string
  email: string | null
  phone?: string | null
  starts_at: string        // ISO 8601 UTC
  ends_at?: string
  status: 'active' | 'cancelled' | string
  booking_type?: { title?: string }
  note?: string | null
  cancel_url?: string | null
  reschedule_url?: string | null
}

const TIDYCAL_API = 'https://tidycal.com/api'

// Stages where it's safe to move the lead forward to reunion_reservada.
// Don't overwrite stages that come after (reunion_realizada, propuesta_enviada, etc.)
const BEFORE_REUNION: string[] = ['lead_entrante', 'contactado']

export async function fetchTidyCalBookings(fromDate: string, toDate: string): Promise<TidyCalBooking[]> {
  const apiKey = process.env.TIDYCAL_API_KEY
  if (!apiKey) throw new Error('TIDYCAL_API_KEY not configured')

  const params = new URLSearchParams({
    'filter[from]': fromDate,
    'filter[to]': toDate,
    'per_page': '100',
  })

  const res = await fetch(`${TIDYCAL_API}/bookings?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`TidyCal API ${res.status}: ${text.slice(0, 200)}`)
  }

  const json = await res.json()
  // API may return { data: [...] } or just [...]
  return (json.data ?? json) as TidyCalBooking[]
}

function toArgentina(utcIso: string): { date: string; time: string } {
  // Argentina = UTC-3, no DST
  const ms = new Date(utcIso).getTime() - 3 * 60 * 60 * 1000
  const d = new Date(ms)
  return {
    date: d.toISOString().slice(0, 10),       // YYYY-MM-DD
    time: d.toISOString().slice(11, 16),       // HH:MM
  }
}

async function isAlreadyProcessed(admin: AdminClient, bookingId: number): Promise<boolean> {
  const { data } = await admin
    .from('activities')
    .select('id')
    .eq('tipo', 'reunion')
    .eq('metadata->>booking_id', String(bookingId))
    .maybeSingle()
  return !!data
}

/**
 * Core logic: processes one TidyCal booking — idempotent, deduplicates by
 * booking_id stored in activities.metadata. Used both by the cron and by the
 * webhook route so both paths produce the same outcome.
 */
export async function processTidyCalBooking(
  admin: AdminClient,
  booking: TidyCalBooking,
): Promise<{ result: 'processed' | 'skipped' | 'error'; reason?: string }> {
  if (booking.status === 'cancelled') {
    return { result: 'skipped', reason: 'cancelled' }
  }

  if (await isAlreadyProcessed(admin, booking.id)) {
    return { result: 'skipped', reason: 'already_processed' }
  }

  const email = booking.email?.trim().toLowerCase() || null
  const phone = booking.phone?.replace(/\D/g, '') || null
  const nombre = booking.name?.trim() || 'Sin nombre'
  const note = booking.note?.trim() || null
  const startTime = booking.starts_at

  if (!email && !phone) {
    return { result: 'error', reason: 'no_email_no_phone' }
  }
  if (!startTime || isNaN(new Date(startTime).getTime())) {
    return { result: 'error', reason: 'invalid_starts_at' }
  }

  // Dedup: find existing lead by email or phone
  const conditions: string[] = []
  if (email) conditions.push(`email.ilike.${email}`)
  if (phone) conditions.push(`telefono.eq.${phone}`, `telefono.eq.+${phone}`)

  const { data: existing } = await admin
    .from('leads')
    .select('id, nombre, estado_pipeline')
    .or(conditions.join(','))
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { date: fecha_reunion, time: reunion_hora } = toArgentina(startTime)

  const activityDesc = `Reunión reservada vía TidyCal${
    booking.booking_type?.title ? ` (${booking.booking_type.title})` : ''
  } — ${fecha_reunion} ${reunion_hora} (AR)`

  // leadId is always assigned before use: existing branch assigns it directly,
  // else branch assigns it on success or returns early on every error path.
  let leadId!: string

  if (existing) {
    leadId = existing.id

    // Only advance to reunion_reservada if the lead hasn't progressed further
    if (BEFORE_REUNION.includes(existing.estado_pipeline ?? '')) {
      await admin
        .from('leads')
        .update({ estado_pipeline: 'reunion_reservada', fecha_reunion, reunion_hora })
        .eq('id', leadId)
    } else if (existing.estado_pipeline === 'reunion_reservada') {
      // Already there — just refresh the date/time in case it changed
      await admin
        .from('leads')
        .update({ fecha_reunion, reunion_hora })
        .eq('id', leadId)
    }
    // For later stages (propuesta, cliente…) we only log the activity, no stage change
  } else {
    // New lead
    const { data: walo } = await admin
      .from('users')
      .select('id')
      .eq('email', 'somosglobalalora@gmail.com')
      .maybeSingle()

    const responsableId: string | null = walo?.id ?? null

    const { data: maxPos } = await admin
      .from('leads')
      .select('kanban_position')
      .eq('estado_pipeline', 'reunion_reservada')
      .is('deleted_at', null)
      .order('kanban_position', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nameParts = nombre.split(/\s+/)
    const { data: newLead, error } = await admin
      .from('leads')
      .insert({
        nombre:          nameParts[0] ?? nombre,
        apellido:        nameParts.slice(1).join(' ') || null,
        email,
        telefono:        phone,
        fuente:          'calendario',
        estado_pipeline: 'reunion_reservada',
        fecha_reunion,
        reunion_hora,
        kanban_position: (maxPos?.kanban_position ?? 0) + 1,
        responsable_id:  responsableId,
        created_by:      responsableId,
        notas:           note ?? null,
      })
      .select('id')
      .single()

    if (error || !newLead) {
      // Race condition: unique violation → re-query
      if (error?.code === '23505') {
        const { data: raced } = await admin
          .from('leads')
          .select('id')
          .or(conditions.join(','))
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle()
        if (raced) {
          leadId = raced.id
        } else {
          return { result: 'error', reason: error?.message ?? 'insert_failed' }
        }
      } else {
        return { result: 'error', reason: error?.message ?? 'insert_failed' }
      }
    } else {
      leadId = newLead.id
      await sendNewLeadAlert({
        id: leadId,
        nombre,
        email,
        telefono: phone,
        empresa: null,
        pais: null,
        fuente: 'calendario',
        mensaje: note ?? null,
      })
    }
  }

  await admin.from('activities').insert({
    lead_id:    leadId,
    user_id:    null,
    tipo:       'reunion',
    descripcion: activityDesc,
    metadata: {
      booking_id:     String(booking.id),
      booking_type:   booking.booking_type?.title ?? null,
      starts_at:      startTime,
      note,
      cancel_url:     booking.cancel_url ?? null,
      reschedule_url: booking.reschedule_url ?? null,
      source:         'tidycal',
    },
  })

  return { result: 'processed' }
}

/**
 * Called by the cron: polls TidyCal API for active bookings across a wide
 * date range, processes each new one. Idempotent — safe to run hourly.
 */
export async function runTidyCalSync(
  admin: AdminClient,
): Promise<{ processed: number; skipped: number; errors: number }> {
  const today = new Date()
  // Look back 7 days (bookings made recently for past/current dates)
  // and forward 90 days (future bookings)
  const from = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const to   = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  let bookings: TidyCalBooking[]
  try {
    bookings = await fetchTidyCalBookings(from, to)
  } catch (err) {
    console.error('[TidyCal] Failed to fetch bookings:', err)
    return { processed: 0, skipped: 0, errors: 1 }
  }

  console.log(`[TidyCal] Fetched ${bookings.length} bookings (${from} → ${to})`)

  let processed = 0
  let skipped = 0
  let errors = 0

  for (const booking of bookings) {
    const { result, reason } = await processTidyCalBooking(admin, booking)
    if (result === 'processed') {
      console.log(`[TidyCal] ✓ booking ${booking.id} processed`)
      processed++
    } else if (result === 'skipped') {
      if (reason !== 'already_processed') {
        console.log(`[TidyCal] Skipped booking ${booking.id}: ${reason}`)
      }
      skipped++
    } else {
      console.error(`[TidyCal] Error on booking ${booking.id}: ${reason}`)
      errors++
    }
  }

  return { processed, skipped, errors }
}
