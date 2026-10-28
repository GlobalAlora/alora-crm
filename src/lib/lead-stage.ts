import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PipelineStage } from '@/types'
import { ensureLeadDriveFolder } from '@/lib/google-drive'
import { createProjectForLead } from '@/lib/projects'

/**
 * Lógica compartida para cambiar la etapa de pipeline de un lead.
 * La usan PATCH /api/leads/[id]/stage (UI del CRM) y el agente MCP (/api/mcp),
 * así cualquier movimiento dispara exactamente los mismos efectos:
 * fechas automáticas, actividad, stage_history, apagar el bot, rechazar
 * propuestas, carpeta de Drive y proyecto automático.
 */

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

export type ChangeLeadStageResult =
  | { ok: true; data: Record<string, unknown>; estado_anterior: string }
  | { ok: false; status: number; error: string }

export async function changeLeadStage(
  db: SupabaseClient,
  params: {
    leadId: string
    estado_pipeline: PipelineStage
    fecha_reunion?: string | null
    userId: string
  },
): Promise<ChangeLeadStageResult> {
  const { leadId: id, estado_pipeline, fecha_reunion, userId } = params

  if (!estado_pipeline) {
    return { ok: false, status: 400, error: 'Etapa inválida' }
  }
  const { data: stageRow } = await db
    .from('pipeline_stages')
    .select('key')
    .eq('key', estado_pipeline)
    .maybeSingle()
  if (!stageRow) {
    return { ok: false, status: 400, error: 'Etapa inválida' }
  }

  // Get current lead (include drive fields + name for idempotency check)
  const { data: current } = await db
    .from('leads')
    .select('estado_pipeline, nombre, apellido, empresa, drive_folder_id, fecha_contacto, fecha_propuesta, fecha_followup, fecha_cierre, fecha_reunion')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!current) return { ok: false, status: 404, error: 'Lead no encontrado' }

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

  const { data, error } = await db
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return { ok: false, status: 500, error: error.message }

  // Log activity
  await db.from('activities').insert({
    lead_id: id,
    user_id: userId,
    tipo: 'cambio_estado',
    descripcion: `Etapa cambiada a "${estado_pipeline}"`,
    metadata: { estado_anterior: current.estado_pipeline, estado_nuevo: estado_pipeline },
  })

  // Record stage history (ignore error if table doesn't exist yet)
  try {
    await db.from('stage_history').insert({
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
    await db
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
        await db
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

  // ── Auto-create PM project when lead becomes cliente_ganado ─────────────
  if (estado_pipeline === 'cliente_ganado') {
    try {
      const adminClient = createAdminClient()
      await createProjectForLead(
        adminClient,
        { id, nombre: current.nombre, apellido: current.apellido ?? null, empresa: current.empresa ?? null },
        userId,
      )
    } catch (projErr) {
      console.error('[Projects] Auto-create failed for lead', id, projErr)
    }
  }

  return { ok: true, data: data as Record<string, unknown>, estado_anterior: current.estado_pipeline as string }
}
