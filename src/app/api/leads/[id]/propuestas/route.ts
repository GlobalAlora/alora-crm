import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncLeadValorPropuesta } from '@/lib/propuestas-sync'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('propuestas')
    .select('*')
    .eq('lead_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { descripcion, valor_usd, valor_ars, moneda, tipo_pago, link } = body

  if (!descripcion) {
    return NextResponse.json({ error: 'La descripción es requerida' }, { status: 400 })
  }

  const resolvedMoneda: string = moneda || 'USD'

  // Enforce single-currency integrity: clear the field that doesn't match moneda
  const resolvedValorUsd = resolvedMoneda === 'USD' ? (valor_usd || null) : null
  const resolvedValorArs = resolvedMoneda === 'ARS' ? (valor_ars || null) : null

  const { data, error } = await supabase
    .from('propuestas')
    .insert({
      lead_id: id,
      descripcion,
      valor_usd: resolvedValorUsd,
      valor_ars: resolvedValorArs,
      moneda: resolvedMoneda,
      tipo_pago: tipo_pago || 'unica_vez',
      estado: 'pendiente',
      link: link || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await syncLeadValorPropuesta(supabase, id)

  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const propuestaId = url.searchParams.get('id')

  if (!propuestaId) {
    return NextResponse.json({ error: 'ID de propuesta requerido' }, { status: 400 })
  }

  const { data: propuesta, error: fetchError } = await supabase
    .from('propuestas')
    .select('lead_id')
    .eq('id', propuestaId)
    .single()

  if (fetchError || !propuesta) {
    return NextResponse.json({ error: 'Propuesta no encontrada' }, { status: 404 })
  }

  if (propuesta.lead_id !== id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { error: deleteError } = await supabase
    .from('propuestas')
    .delete()
    .eq('id', propuestaId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  await syncLeadValorPropuesta(supabase, id)

  return NextResponse.json({ success: true })
}
