import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PipelineStage } from '@/types'

const VALID_STAGES: PipelineStage[] = [
  'lead_entrante', 'lead_contactado', 'sin_respuesta', 'reunion_reservada',
  'reunion_realizada', 'propuesta_en_armado', 'propuesta_enviada',
  'follow_up', 'cliente_ganado', 'cliente_perdido', 'no_cualificado',
]

const STAGE_DATE_MAP: Partial<Record<PipelineStage, string>> = {
  lead_contactado: 'fecha_contacto',
  reunion_reservada: 'fecha_reunion',
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

  const { estado_pipeline } = await req.json()

  if (!VALID_STAGES.includes(estado_pipeline)) {
    return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 })
  }

  // Get current lead
  const { data: current } = await supabase
    .from('leads')
    .select('estado_pipeline')
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

  // Set date field if not already set
  const dateField = STAGE_DATE_MAP[estado_pipeline as PipelineStage]
  if (dateField) updates[dateField] = now

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

  return NextResponse.json({ data })
}
