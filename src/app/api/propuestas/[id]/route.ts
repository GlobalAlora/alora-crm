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
  const { estado, descripcion, valor_usd, valor_ars, moneda, tipo_pago, link } = body

  const updateData: Record<string, unknown> = {}
  if (estado !== undefined) updateData.estado = estado
  if (descripcion !== undefined) updateData.descripcion = descripcion
  if (valor_usd !== undefined) updateData.valor_usd = valor_usd
  if (valor_ars !== undefined) updateData.valor_ars = valor_ars
  if (moneda !== undefined) updateData.moneda = moneda
  if (tipo_pago !== undefined) updateData.tipo_pago = tipo_pago
  if (link !== undefined) updateData.link = link

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
