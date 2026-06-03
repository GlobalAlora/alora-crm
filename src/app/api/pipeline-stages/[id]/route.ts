import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

  const body = await req.json()
  const allowed = ['label', 'color', 'bg_color', 'zone']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pipeline_stages')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

  const admin = createAdminClient()

  // Can't delete system stages
  const { data: stage } = await admin.from('pipeline_stages').select('key, is_system').eq('id', id).single()
  if (!stage) return NextResponse.json({ error: 'Etapa no encontrada' }, { status: 404 })
  if (stage.is_system) return NextResponse.json({ error: 'No se pueden eliminar etapas del sistema' }, { status: 400 })

  // Validate no leads in this stage
  const { count } = await admin
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('estado_pipeline', stage.key)
    .is('deleted_at', null)

  if (count && count > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: hay ${count} lead${count === 1 ? '' : 's'} en esta etapa` },
      { status: 400 }
    )
  }

  const { error } = await admin.from('pipeline_stages').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
