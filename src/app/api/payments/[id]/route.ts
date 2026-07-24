import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// PATCH /api/payments/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const allowed = ['descripcion', 'monto', 'fecha_vencimiento', 'fecha_pago', 'metodo_pago', 'notas', 'comprobante_url']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: payment, error } = await admin
    .from('payments')
    .update(updates)
    .eq('id', id)
    .select('*, invoice_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recalc invoice estado
  if (payment?.invoice_id) {
    await recalcEstado(admin, payment.invoice_id)
  }

  return NextResponse.json({ data: payment })
}

// DELETE /api/payments/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const admin = createAdminClient()

  const { data: payment } = await admin.from('payments').select('invoice_id').eq('id', id).maybeSingle()

  const { error } = await admin.from('payments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (payment?.invoice_id) {
    await recalcEstado(admin, payment.invoice_id)
  }

  return NextResponse.json({ ok: true })
}

async function recalcEstado(admin: ReturnType<typeof createAdminClient>, invoiceId: string) {
  const [{ data: payments }, { data: items }, { data: inv }] = await Promise.all([
    admin.from('payments').select('monto, fecha_pago').eq('invoice_id', invoiceId),
    admin.from('invoice_items').select('cantidad, precio_unitario').eq('invoice_id', invoiceId),
    admin.from('invoices').select('estado').eq('id', invoiceId).maybeSingle(),
  ])

  if (!inv || inv.estado === 'cancelada') return

  const total  = (items ?? []).reduce((s, it) => s + (it.cantidad * it.precio_unitario), 0)
  const pagado = (payments ?? []).filter(p => p.fecha_pago).reduce((s, p) => s + p.monto, 0)

  if (total <= 0) return

  let estado: string
  if (pagado >= total) {
    estado = 'pagada'
  } else if (pagado > 0) {
    estado = 'parcialmente_pagada'
  } else if (inv.estado === 'pagada' || inv.estado === 'parcialmente_pagada') {
    estado = 'enviada'
  } else {
    return
  }

  await admin.from('invoices').update({ estado }).eq('id', invoiceId)
}
