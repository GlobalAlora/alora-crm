import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('*')
    .order('order_position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

  const body = await req.json()
  const { label, color = '#64748b', bg_color = '#f1f5f9', zone = 'gestion', descripcion = null } = body

  if (!label?.trim()) return NextResponse.json({ error: 'El label es requerido' }, { status: 400 })

  // Generate key from label
  const key = label.trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')

  // Get max position
  const admin = createAdminClient()
  const { data: maxRow } = await admin
    .from('pipeline_stages')
    .select('order_position')
    .order('order_position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await admin
    .from('pipeline_stages')
    .insert({ key, label: label.trim(), color, bg_color, zone, descripcion, order_position: (maxRow?.order_position ?? 0) + 1, is_system: false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
