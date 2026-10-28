import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PipelineStage } from '@/types'
import { changeLeadStage } from '@/lib/lead-stage'

type Params = { params: Promise<{ id: string }> }

// La lógica del cambio de etapa vive en src/lib/lead-stage.ts para que el
// agente MCP (/api/mcp) dispare exactamente los mismos efectos que la UI.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { estado_pipeline, fecha_reunion } = body as { estado_pipeline: PipelineStage; fecha_reunion?: string | null }

  const result = await changeLeadStage(supabase, {
    leadId: id,
    estado_pipeline,
    fecha_reunion,
    userId: user.id,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ data: result.data })
}
