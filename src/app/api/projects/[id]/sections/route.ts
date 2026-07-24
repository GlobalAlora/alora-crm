import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as { nombre: string; color?: string; is_done?: boolean }
  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Get max position
  const { data: maxRow } = await admin
    .from('task_sections')
    .select('position')
    .eq('project_id', id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await admin
    .from('task_sections')
    .insert({
      project_id: id,
      nombre:     body.nombre.trim(),
      color:      body.color ?? '#94A3B8',
      position:   (maxRow?.position ?? -1) + 1,
      is_done:    body.is_done ?? false,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
