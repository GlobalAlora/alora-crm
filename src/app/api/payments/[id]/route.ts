import { NextRequest, NextResponse } from 'next/server'
import { requireBillingAccess } from '@/lib/billing-auth'
import { recalcEstado } from '@/app/api/invoices/[id]/payments/route'

// PATCH /api/payments/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBillingAccess()
  if (auth.error) return auth.error

  const { id } = await params
  const body = await req.json()

  const allowed = [
    'descripcion', 'monto', 'fecha_vencimiento', 'fecha_pago', 'metodo_pago', 'notas', 'alerta_enviada_at',
    'numero_factura', 'factura_enviada_at', 'attachments',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { admin } = auth
  const { data: payment, error } = await admin
    .from('payments')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (payment?.invoice_id) await recalcEstado(admin, payment.invoice_id)

  return NextResponse.json({ data: payment })
}

// DELETE /api/payments/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBillingAccess()
  if (auth.error) return auth.error

  const { id } = await params
  const { admin } = auth

  const { data: payment } = await admin.from('payments').select('invoice_id').eq('id', id).maybeSingle()
  const { error } = await admin.from('payments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (payment?.invoice_id) await recalcEstado(admin, payment.invoice_id)

  return NextResponse.json({ ok: true })
}
