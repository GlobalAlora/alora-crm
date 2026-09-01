import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncLeadValorPropuesta } from '@/lib/propuestas-sync'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { estado, descripcion, valor_usd, valor_ars, moneda, tipo_pago, link, contenido } = body

  const updateData: Record<string, unknown> = {}
  if (estado !== undefined) updateData.estado = estado
  if (descripcion !== undefined) updateData.descripcion = descripcion
  if (moneda !== undefined) updateData.moneda = moneda
  if (tipo_pago !== undefined) updateData.tipo_pago = tipo_pago
  if (link !== undefined) updateData.link = link
  if (contenido !== undefined) updateData.contenido = contenido

  // Enforce single-currency integrity when moneda is being set or when values change
  if (moneda === 'USD') {
    updateData.valor_usd = valor_usd ?? updateData.valor_usd
    updateData.valor_ars = null
  } else if (moneda === 'ARS') {
    updateData.valor_ars = valor_ars ?? updateData.valor_ars
    updateData.valor_usd = null
  } else {
    // moneda not changing — update whichever value was provided
    if (valor_usd !== undefined) updateData.valor_usd = valor_usd
    if (valor_ars !== undefined) updateData.valor_ars = valor_ars
  }

  const { data, error } = await supabase
    .from('propuestas')
    .update(updateData)
    .eq('id', id)
    .select('*, lead_id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await syncLeadValorPropuesta(supabase, data.lead_id)

  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Get lead_id before deleting
  const { data: propuesta } = await supabase
    .from('propuestas')
    .select('lead_id')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('propuestas')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (propuesta?.lead_id) {
    await syncLeadValorPropuesta(supabase, propuesta.lead_id)
  }

  return NextResponse.json({ success: true })
}
