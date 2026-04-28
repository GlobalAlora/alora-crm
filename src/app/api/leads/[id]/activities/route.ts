import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const MAX_LIMIT = 100
const MANUAL_TYPES = ['nota', 'llamada', 'email', 'reunion', 'webhook']

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const sp = req.nextUrl.searchParams
  const limit = Math.min(Number(sp.get('limit') ?? 50), MAX_LIMIT)
  const page = Math.max(Number(sp.get('page') ?? 1), 1)
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('activities')
    .select('*, user:users!user_id(id, full_name, avatar_url)', { count: 'exact' })
    .eq('lead_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data,
    meta: { total: count ?? 0, page, limit, total_pages: Math.ceil((count ?? 0) / limit) },
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { tipo, descripcion, metadata } = await req.json()

  if (!MANUAL_TYPES.includes(tipo)) {
    return NextResponse.json(
      { error: 'Tipo inválido. Los cambios de estado se registran automáticamente.' },
      { status: 400 }
    )
  }

  if (!descripcion?.trim()) {
    return NextResponse.json({ error: 'La descripción es requerida' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('activities')
    .insert({ lead_id: id, user_id: user.id, tipo, descripcion: descripcion.trim(), metadata: metadata ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data }, { status: 201 })
}
