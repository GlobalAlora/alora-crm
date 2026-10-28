import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateLead } from '@/lib/lead-update'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const FOLLOWUP_HOURS = [0.5, 48]
  const admin = createAdminClient()

  // Fetch lead with propuestas, stage history, meeting history, and whatsapp conversation status
  const [{ data: lead, error: leadError }, { data: propuestas }, { data: stageHistory }, { data: waConvo }, { data: reuniones }] = await Promise.all([
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
    admin
      .from('whatsapp_conversations')
      .select('id, phone_number, bot_active, last_message_direction, last_message_at, followup_count')
      .eq('lead_id', id)
      .maybeSingle(),
    admin
      .from('reuniones')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: false }),
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

  let next_followup_at: string | null = null
  if (
    waConvo?.bot_active &&
    waConvo.last_message_direction === 'outbound' &&
    waConvo.last_message_at &&
    waConvo.followup_count != null &&
    waConvo.followup_count < FOLLOWUP_HOURS.length
  ) {
    const hoursToAdd = FOLLOWUP_HOURS[waConvo.followup_count]
    const ts = new Date(waConvo.last_message_at).getTime() + hoursToAdd * 3_600_000
    next_followup_at = new Date(ts).toISOString()
  }

  const whatsapp_conversation = waConvo ? { id: waConvo.id, phone_number: waConvo.phone_number } : null

  return NextResponse.json({ data: { ...lead, propuestas: propuestas || [], stage_history: stageHistory || [], reuniones: reuniones || [], calidad_lead, dias_sin_respuesta, next_followup_at, whatsapp_conversation } })
}

// La lógica de edición vive en src/lib/lead-update.ts para que el agente MCP
// (/api/mcp) dispare exactamente los mismos efectos que la UI.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const result = await updateLead(supabase, { id, body, userId: user.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ data: result.data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Use admin client to bypass RLS for soft delete.
  // The leads_update policy restricts UPDATE to admin or own leads only,
  // which blocks soft-delete for users without those permissions.
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('leads')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, deleted_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
