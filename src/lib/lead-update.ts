import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createCalendarEvent, updateCalendarEvent } from '@/lib/google-calendar'
import { recordReunionInstance, markReunionAsistencia } from '@/lib/reuniones'

/**
 * Lógica compartida para editar la ficha de un lead.
 * La usan PATCH /api/leads/[id] (UI del CRM) y el agente MCP (/api/mcp), así
 * cualquier edición dispara los mismos efectos: evento de Google Calendar,
 * historial de reuniones, actividad de asistencia y de cambio de responsable.
 * `body` se modifica in-place (igual que antes en la ruta).
 */

export type UpdateLeadResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string }

export async function updateLead(
  supabase: SupabaseClient,
  params: { id: string; body: Record<string, any>; userId: string }, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<UpdateLeadResult> {
  const { id, body, userId } = params

  // Capture and strip non-DB flags before touching anything else
  const skipCalendar = body.skip_calendar === true
  delete body.skip_calendar

  // Block protected fields
  const blocked = ['id', 'estado_pipeline', 'kanban_position', 'deleted_at', 'created_at', 'created_by']
  for (const key of blocked) {
    if (key in body) delete body[key]
  }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return { ok: false, status: 400, error: 'Email inválido' }
  }

  if (body.email_secundario && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email_secundario)) {
    return { ok: false, status: 400, error: 'Email secundario inválido' }
  }

  // When changing currency, always clear the other currency value to avoid stale totals
  if (body.valor_propuesta_moneda === 'ARS' && !('valor_propuesta_usd' in body)) {
    body.valor_propuesta_usd = null
  }
  if (body.valor_propuesta_moneda === 'USD' && !('valor_propuesta_ars' in body)) {
    body.valor_propuesta_ars = null
  }

  // Detect if fecha_reunion is being set on a reunion_reservada lead (calendar trigger)
  let calendarLeadSnapshot: {
    estado_pipeline: string
    nombre: string
    apellido: string | null
    empresa: string | null
    email: string | null
    reunion_hora: string | null
    reunion_link: string | null
    calendar_event_id: string | null
    responsable_id: string | null
  } | null = null

  // When skip_calendar=true, mark the lead as externally booked (e.g. Tidycal).
  // Sentinel 'external' in calendar_event_id prevents future auto-creation.
  if (skipCalendar) {
    body.calendar_event_id = 'external'
    body.calendar_event_url = null
  }

  if ('fecha_reunion' in body && body.fecha_reunion && process.env.GOOGLE_CALENDAR_SUBJECT && !skipCalendar) {
    const { data: snap } = await supabase
      .from('leads')
      .select('estado_pipeline, nombre, apellido, empresa, email, reunion_hora, reunion_link, calendar_event_id, responsable_id')
      .eq('id', id)
      .is('deleted_at', null)
      .single()
    // Only trigger Calendar if lead is reunion_reservada and NOT already marked external
    if (snap?.estado_pipeline === 'reunion_reservada' && snap.calendar_event_id !== 'external') {
      calendarLeadSnapshot = snap
    }
  }

  // Detect responsable_id change BEFORE updating so we can log the activity
  let responsableActivityPayload: {
    prev: { id: string; full_name: string | null } | null
    next: { id: string; full_name: string | null } | null
  } | null = null

  if ('responsable_id' in body) {
    const { data: currentLead } = await supabase
      .from('leads')
      .select('responsable_id, responsable:users!responsable_id(id, full_name)')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    const prevId = currentLead?.responsable_id ?? null
    const nextId = body.responsable_id ?? null

    if (prevId !== nextId) {
      const nextUser = nextId
        ? await supabase.from('users').select('id, full_name').eq('id', nextId).maybeSingle().then(r => r.data)
        : null

      // Supabase typing returns array for joined relations, take first if present
      const prevUserRaw = currentLead?.responsable as unknown
      const prevUser = Array.isArray(prevUserRaw) ? prevUserRaw[0] : prevUserRaw
      responsableActivityPayload = {
        prev: prevUser ? { id: prevUser.id, full_name: prevUser.full_name ?? null } : null,
        next: nextUser ? { id: nextUser.id, full_name: nextUser.full_name ?? null } : null,
      }
    }
  }

  // A reagendo is a fresh, still-pending meeting -- it never gets a "final"
  // reunion_asistencia_at, and (below) the actual leads.reunion_asistencia
  // written to the DB is forced back to null instead of 'reagendo', because
  // that column always describes the CURRENT/vigente meeting, and after a
  // reschedule the current meeting is the new one, which hasn't happened
  // yet. The old meeting's own 'reagendo' outcome is recorded per-instance
  // in `reuniones` further below, not lost.
  const isReagendo = body.reunion_asistencia === 'reagendo'
  let reunionSnapshot: { fecha_reunion: string | null; reunion_hora: string | null; reunion_link: string | null } | null = null
  if ('reunion_asistencia' in body && body.reunion_asistencia) {
    if (isReagendo) {
      const { data: snap } = await supabase
        .from('leads')
        .select('fecha_reunion, reunion_hora, reunion_link')
        .eq('id', id)
        .is('deleted_at', null)
        .single()
      reunionSnapshot = snap
    } else {
      body.reunion_asistencia_at = new Date().toISOString()
    }
  }

  const leadsUpdateBody = isReagendo
    ? { ...body, reunion_asistencia: null, reunion_asistencia_at: null }
    : body

  const { data, error } = await supabase
    .from('leads')
    .update({ ...leadsUpdateBody, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return { ok: false, status: 500, error: error.message }

  // Log responsable reassignment activity (best-effort; don't fail the request)
  if (responsableActivityPayload) {
    const { prev, next } = responsableActivityPayload
    const prevName = prev?.full_name ?? 'sin asignar'
    const nextName = next?.full_name ?? 'sin asignar'
    await supabase.from('activities').insert({
      lead_id: id,
      user_id: userId,
      tipo: 'cambio_estado',
      descripcion: `Responsable cambiado de ${prevName} a ${nextName}`,
      metadata: {
        kind: 'responsable_change',
        prev_responsable_id: prev?.id ?? null,
        prev_responsable_name: prev?.full_name ?? null,
        next_responsable_id: next?.id ?? null,
        next_responsable_name: next?.full_name ?? null,
      },
    })
  }

  // Log reunion_asistencia change (best-effort)
  if ('reunion_asistencia' in body && body.reunion_asistencia) {
    const labels: Record<string, string> = {
      se_presento:      '✅ Se presentó a la reunión',
      no_se_presento:   '❌ No se presentó a la reunión',
      reagendo:         '🔄 Reagendó la reunión',
      cancelada_alora:  '🚫 Reunión cancelada por ALORA',
    }
    const descripcion = labels[body.reunion_asistencia as string] ?? 'Estado de reunión actualizado'
    await supabase.from('activities').insert({
      lead_id: id,
      user_id: userId,
      tipo: 'reunion',
      descripcion,
      metadata: {
        kind: 'reunion_asistencia',
        asistencia: body.reunion_asistencia,
        ...(body.fecha_reunion  ? { nueva_fecha:  body.fecha_reunion  } : {}),
        ...(body.reunion_hora   ? { nueva_hora:   body.reunion_hora   } : {}),
        ...(body.reunion_link   ? { nuevo_link:   body.reunion_link   } : {}),
      },
    })

    // Keep the per-instance meeting history in sync with this asistencia change
    const admin = createAdminClient()
    if (isReagendo) {
      await recordReunionInstance(admin, {
        leadId: id,
        previous: reunionSnapshot?.fecha_reunion
          ? { fecha_reunion: reunionSnapshot.fecha_reunion, reunion_hora: reunionSnapshot.reunion_hora, reunion_link: reunionSnapshot.reunion_link }
          : null,
        next: {
          fecha_reunion: (body.fecha_reunion ?? reunionSnapshot?.fecha_reunion) as string,
          reunion_hora: (body.reunion_hora ?? reunionSnapshot?.reunion_hora) ?? null,
          reunion_link: (body.reunion_link ?? reunionSnapshot?.reunion_link) ?? null,
        },
        origen: 'manual',
      })
    } else {
      await markReunionAsistencia(admin, {
        leadId: id,
        fechaReunion: (data as { fecha_reunion?: string | null } | null)?.fecha_reunion ?? null,
        asistencia: body.reunion_asistencia as 'se_presento' | 'no_se_presento' | 'cancelada_alora',
      })
    }
  }

  // ── Google Calendar event ────────────────────────────────────────────────────
  // Triggered when fecha_reunion is set/updated on a reunion_reservada lead.
  // Creates a new event or patches the existing one. Non-fatal.
  if (calendarLeadSnapshot && data) {
    try {
      const snap = calendarLeadSnapshot
      // Merge updated fields from body into snapshot for the event payload
      const hora   = ('reunion_hora' in body  ? body.reunion_hora  : snap.reunion_hora)  as string | null
      const link   = ('reunion_link' in body  ? body.reunion_link  : snap.reunion_link)  as string | null

      // Get responsable email for the attendee list
      let responsableEmail: string | null = null
      if (snap.responsable_id) {
        const { data: ru } = await supabase
          .from('users')
          .select('email')
          .eq('id', snap.responsable_id)
          .maybeSingle()
        responsableEmail = ru?.email ?? null
      }

      const eventInput = {
        leadId:            id,
        nombre:            snap.nombre,
        apellido:          snap.apellido,
        empresa:           snap.empresa,
        email:             snap.email,
        fecha_reunion:     body.fecha_reunion as string,
        reunion_hora:      hora,
        reunion_link:      link,
        responsable_email: responsableEmail,
      }

      const result = snap.calendar_event_id && snap.calendar_event_id !== 'external'
        ? await updateCalendarEvent(snap.calendar_event_id, eventInput)
        : await createCalendarEvent(eventInput)

      await supabase
        .from('leads')
        .update({ calendar_event_id: result.eventId, calendar_event_url: result.eventUrl })
        .eq('id', id)

      ;(data as Record<string, unknown>).calendar_event_id  = result.eventId
      ;(data as Record<string, unknown>).calendar_event_url = result.eventUrl
    } catch (calErr) {
      console.error('[Calendar] Failed to create/update event for lead', id, calErr)
    }
  }

  return { ok: true, data: data as Record<string, unknown> }
}
