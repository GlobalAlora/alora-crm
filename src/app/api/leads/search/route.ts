import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')?.trim()
  const limit = Math.min(10, parseInt(searchParams.get('limit') || '10', 10))

  if (!query) {
    return NextResponse.json({ data: [] })
  }

  const { data, error } = await supabase
    .from('leads')
    .select('id, nombre, apellido, empresa, estado_pipeline')
    .is('deleted_at', null)
    .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%,empresa.ilike.%${query}%`)
    .order('last_activity_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
