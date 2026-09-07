import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export interface ReunionInstance {
  fecha_reunion: string
  reunion_hora: string | null
  reunion_link: string | null
}

/**
 * Records a (re)scheduled meeting as its own row in `reuniones`, closing out
 * the previous pending instance as "reagendo" when this is a genuine
 * reschedule (previous meeting had a different date/time). Every booking
 * path (TidyCal, LIDIA, manual UI) calls this any time it sets
 * leads.fecha_reunion/reunion_hora to a new value, so no meeting instance is
 * ever silently overwritten -- each keeps its own outcome.
 */
export async function recordReunionInstance(
  admin: AdminClient,
  params: {
    leadId: string
    previous: ReunionInstance | null
    next: ReunionInstance
    origen: 'tidycal' | 'lidia' | 'manual'
    bookingId?: string | null
  }
): Promise<void> {
  const { leadId, previous, next, origen, bookingId } = params
  const isReschedule = !!previous && (
    previous.fecha_reunion !== next.fecha_reunion || previous.reunion_hora !== next.reunion_hora
  )

  if (isReschedule) {
    const { data: pending } = await admin
      .from('reuniones')
      .select('id')
      .eq('lead_id', leadId)
      .eq('fecha_reunion', previous!.fecha_reunion)
      .is('asistencia', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pending) {
      await admin
        .from('reuniones')
        .update({
          asistencia: 'reagendo',
          asistencia_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', pending.id)
    }
  }

  await admin.from('reuniones').insert({
    lead_id: leadId,
    fecha_reunion: next.fecha_reunion,
    reunion_hora: next.reunion_hora,
    reunion_link: next.reunion_link,
    origen,
    booking_id: bookingId ?? null,
  })
}

/**
 * Marks the lead's current pending meeting instance (fecha_reunion matches,
 * asistencia still null) with a final outcome -- se_presento / no_se_presento
 * / cancelada_alora. Falls back to the most recent instance for the lead if
 * none matches exactly (e.g. the leads row's fecha_reunion had already
 * drifted from the reuniones row for some other reason).
 */
export async function markReunionAsistencia(
  admin: AdminClient,
  params: {
    leadId: string
    fechaReunion: string | null
    asistencia: 'se_presento' | 'no_se_presento' | 'cancelada_alora'
  }
): Promise<void> {
  const { leadId, fechaReunion, asistencia } = params
  let query = admin
    .from('reuniones')
    .select('id')
    .eq('lead_id', leadId)
    .is('asistencia', null)
    .order('created_at', { ascending: false })
    .limit(1)

  if (fechaReunion) query = query.eq('fecha_reunion', fechaReunion)

  const { data: pending } = await query.maybeSingle()
  if (!pending) return

  await admin
    .from('reuniones')
    .update({
      asistencia,
      asistencia_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', pending.id)
}
