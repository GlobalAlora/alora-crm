import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { descripcion, valor_usd, valor_ars, moneda } = body

  if (!descripcion) {
    return NextResponse.json({ error: 'La descripción es requerida' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('propuestas')
    .insert({
      lead_id: id,
      descripcion,
      valor_usd: valor_usd || null,
      valor_ars: valor_ars || null,
      moneda: moneda || 'USD',
      estado: 'pendiente',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
