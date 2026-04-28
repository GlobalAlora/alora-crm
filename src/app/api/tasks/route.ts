import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const completada = sp.get('completada')   // 'true' | 'false' | null (all)
  const asignado_a = sp.get('asignado_a')
  const vencimiento_desde = sp.get('vencimiento_desde')
  const vencimiento_hasta = sp.get('vencimiento_hasta')

  let query = supabase
    .from('tasks')
    .select(`
      *,
      lead:leads(id, nombre, apellido, estado_pipeline),
      asignado:users!asignado_a(id, full_name, avatar_url)
    `)

  if (completada !== null) query = query.eq('completada', completada === 'true')
  if (asignado_a) query = query.eq('asignado_a', asignado_a)
  if (vencimiento_desde) query = query.gte('vencimiento', vencimiento_desde)
  if (vencimiento_hasta) query = query.lte('vencimiento', vencimiento_hasta)

  // Pending first ordered by due date, then completed desc
  const { data: pending } = await supabase
    .from('tasks')
    .select(`
      *,
      lead:leads(id, nombre, apellido, estado_pipeline),
      asignado:users!asignado_a(id, full_name, avatar_url)
    `)
    .eq('completada', false)
    .order('vencimiento', { ascending: true, nullsFirst: false })

  const { data: done } = await supabase
    .from('tasks')
    .select(`
      *,
      lead:leads(id, nombre, apellido, estado_pipeline),
      asignado:users!asignado_a(id, full_name, avatar_url)
    `)
    .eq('completada', true)
    .order('completada_at', { ascending: false })
    .limit(50)

  let result = [...(pending ?? []), ...(done ?? [])]

  return NextResponse.json({ data: result })
}
