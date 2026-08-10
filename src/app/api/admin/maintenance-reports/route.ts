import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('client_id')

  const admin = createAdminClient()
  let query = admin
    .from('maintenance_reports')
    .select('*, portal_clients(nombre, empresa)')
    .order('mes', { ascending: false })
    .order('created_at', { ascending: false })

  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as {
    client_id: string
    titulo: string
    mes: string
    contenido?: string
    archivo_url?: string
    archivo_nombre?: string
  }

  if (!body.client_id || !body.titulo?.trim() || !body.mes) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('maintenance_reports')
    .insert({
      client_id:      body.client_id,
      titulo:         body.titulo.trim(),
      mes:            body.mes,
      contenido:      body.contenido?.trim() || null,
      archivo_url:    body.archivo_url || null,
      archivo_nombre: body.archivo_nombre || null,
      created_by:     user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
