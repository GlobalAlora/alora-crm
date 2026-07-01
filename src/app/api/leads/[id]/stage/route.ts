import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PipelineStage } from '@/types'
import { ensureLeadDriveFolder } from '@/lib/google-drive'

const VALID_STAGES: PipelineStage[] = [
  'lead_entrante', 'lead_contactado', 'sin_respuesta', 'reunion_reservada',
  'reunion_realizada', 'propuesta_en_armado', 'propuesta_enviada',
  'follow_up', 'cliente_ganado', 'cliente_perdido', 'no_cualificado',
]

const CLOSING_STAGES: PipelineStage[] = ['cliente_ganado', 'cliente_perdido']

// fecha_reunion is NOT auto-stamped here — it must be supplied explicitly by the
// user (via the KanbanBoard meeting-date modal or the LeadDetail form) so the
// card shows the actual meeting date, not the moment the card was dragged.
const STAGE_DATE_MAP: Partial<Record<PipelineStage, string>> = {
  lead_contactado: 'fecha_contacto',
  propuesta_enviada: 'fecha_propuesta',
  follow_up: 'fecha_followup',
  cliente_ganado: 'fecha_cierre',
  cliente_perdido: 'fecha_cierre',
}

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { estado_pipeline, fecha_reunion } = body as { estado_pipeline: PipelineStage; fecha_reunion?: string | null }

  if (!VALID_STAGES.includes(estado_pipeline)) {
    return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 })
  }

  // Get current lead (include drive fields + name for idempotency check)
  const { data: current } = await supabase
    .from('leads')
    .select('estado_pipeline, nombre, apellido, empresa, drive_folder_id, fecha_contacto, fecha_propuesta, fecha_followup, fecha_cierre, fecha_reunion')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!current) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {
    estado_pipeline,
    stage_updated_at: now,
    updated_at: now,
  }

  // Auto-stamp date fields — but ONLY if not already set in the ficha.
  // This preserves manually-edited dates and prevents stage movements from
  // overwriting the real business date (e.g. a deal closed in April should
  // not get fecha_cierre = today just because the card was dragged in May).
  const dateField = STAGE_DATE_MAP[estado_pipeline as PipelineStage]
  if (dateField && !(current as Record<string, unknown>)[dateField]) {
    updates[dateField] = now
  }

  // Accept explicitly provided meeting date (reunion_reservada only)
  if (estado_pipeline === 'reunion_reservada' && fecha_reunion) {
    updates['fecha_reunion'] = fecha_reunion
  }

  // If moving AWAY from a closing stage back to an active stage, clear fecha_cierre
  // so a future close stamps the correct date instead of reusing the old one.
  if (
    !CLOSING_STAGES.includes(estado_pipeline) &&
    CLOSING_STAGES.includes(current.estado_pipeline as PipelineStage)
  ) {
    updates['fecha_cierre'] = null
  }

  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log activity
  await supabase.from('activities').insert({
    lead_id: id,
    user_id: user.id,
    tipo: 'cambio_estado',
    descripcion: `Etapa cambiada a "${estado_pipeline}"`,
    metadata: { estado_anterior: current.estado_pipeline, estado_nuevo: estado_pipeline },
  })

  // Record stage history (ignore error if table doesn't exist yet)
  try {
    await supabase.from('stage_history').insert({
      lead_id: id,
      etapa: estado_pipeline,
      fecha_ingreso: now,
    })
  } catch {
    // table may not exist yet
  }

  // ── Disable Lidia when lead is disqualified ───────────────────────────────
  // A no_cualificado lead should never receive another message from the bot.
  if (estado_pipeline === 'no_cualificado') {
    const admin = createAdminClient()
    await admin
      .from('whatsapp_conversations')
      .update({ bot_active: false })
      .eq('lead_id', id)
  }

  // ── Auto-reject pending proposals when lead is lost ───────────────────────
  // When a lead moves to cliente_perdido, all pendiente proposals become rechazada
  // automatically. This keeps proposal stats honest without manual cleanup.
  if (estado_pipeline === 'cliente_perdido') {
    await supabase
      .from('propuestas')
      .update({ estado: 'rechazada' })
      .eq('lead_id', id)
      .eq('estado', 'pendiente')
  }

  // ── Google Drive folder creation ───────────────────────────────────────────
  // Trigger only when entering reunion_realizada for the first time.
  // Idempotent: if drive_folder_id is already set, ensureLeadDriveFolder
  // returns immediately without touching the Drive API.
  if (
    estado_pipeline === 'reunion_reservada' &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  ) {
    try {
      const folder = await ensureLeadDriveFolder({
        id,
        nombre:    current.nombre,
        apellido:  current.apellido ?? null,
        empresa:   current.empresa  ?? null,
        drive_folder_id: current.drive_folder_id ?? null,
      })

      if (!folder.alreadyExisted || !current.drive_folder_id) {
        // Persist to DB and update the response
        await supabase
          .from('leads')
          .update({
            drive_folder_id:  folder.folderId,
            drive_folder_url: folder.folderUrl,
          })
          .eq('id', id)

        // Patch the response so the client can show the link immediately
        if (data) {
          (data as Record<string, unknown>).drive_folder_id  = folder.folderId
          ;(data as Record<string, unknown>).drive_folder_url = folder.folderUrl
        }
      }
    } catch (driveErr) {
      // Non-fatal: log but don't block the stage change
      console.error('[Drive] Failed to create folder for lead', id, driveErr)
    }
  }

  return NextResponse.json({ data })
}
