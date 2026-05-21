import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCalendarEvent, updateCalendarEvent } from '@/lib/google-calendar'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Fetch lead with propuestas and stage history
  const [{ data: lead, error: leadError }, { data: propuestas }, { data: stageHistory }] = await Promise.all([
    supabase
      .from('leads')
      .select('*, responsable:users!responsable_id(id, full_name, avatar_url), lider_tecnico:team_members!lider_tecnico_id(id, full_name, role), dev:team_members!dev_id(id, full_name, role)')
      .eq('id', id)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('propuestas')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('stage_history')
      .select('*')
      .eq('lead_id', id)
      .order('fecha_ingreso', { ascending: false }),
  ])

  if (leadError || !lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })

  // Compute calidad_lead
  let calidad_lead = 'no_calificado'
  const sqlStages = ['reunion_reservada', 'reunion_realizada', 'propuesta_en_armado', 'propuesta_enviada', 'follow_up', 'cliente_ganado']
  if (sqlStages.includes(lead.estado_pipeline)) {
    calidad_lead = 'SQL'
  } else if (lead.email && lead.servicio_interesado) {
    calidad_lead = 'MQL'
  }

  const dias_sin_respuesta = lead.stage_updated_at
    ? Math.floor((Date.now() - new Date(lead.stage_updated_at).getTime()) / 86_400_000)
    : 0

  return NextResponse.json({ data: { ...lead, propuestas: propuestas || [], stage_history: stageHistory || [], calidad_lead, dias_sin_respuesta } })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()

  // Block protected fields
  const blocked = ['id', 'estado_pipeline', 'kanban_position', 'deleted_at', 'created_at', 'created_by']
  for (const key of blocked) {
    if (key in body) delete body[key]
  }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  if (body.email_secundario && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email_secundario)) {
    return NextResponse.json({ error: 'Email secundario inválido' }, { status: 400 })
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

  if ('fecha_reunion' in body && body.fecha_reunion && process.env.GOOGLE_CALENDAR_SUBJECT) {
    const { data: snap } = await supabase
      .from('leads')
      .select('estado_pipeline, nombre, apellido, empresa, email, reunion_hora, reunion_link, calendar_event_id, responsable_id')
      .eq('id', id)
      .is('deleted_at', null)
      .single()
    if (snap?.estado_pipeline === 'reunion_reservada') {
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

  const { data, error } = await supabase
    .from('leads')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log responsable reassignment activity (best-effort; don't fail the request)
  if (responsableActivityPayload) {
    const { prev, next } = responsableActivityPayload
    const prevName = prev?.full_name ?? 'sin asignar'
    const nextName = next?.full_name ?? 'sin asignar'
    await supabase.from('activities').insert({
      lead_id: id,
      user_id: user.id,
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

      const result = snap.calendar_event_id
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

  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('leads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, deleted_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
