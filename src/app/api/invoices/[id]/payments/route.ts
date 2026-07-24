import { NextRequest, NextResponse } from 'next/server'
import { requireBillingAccess } from '@/lib/billing-auth'
import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

// GET /api/invoices/[id]/payments
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBillingAccess()
  if (auth.error) return auth.error

  const { id } = await params
  const { data, error } = await auth.admin
    .from('payments')
    .select('*')
    .eq('invoice_id', id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/invoices/[id]/payments
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBillingAccess()
  if (auth.error) return auth.error

  const { id } = await params
  const body = await req.json()
  const { descripcion = 'Pago', monto, fecha_vencimiento, fecha_pago, metodo_pago, notas } = body

  if (!monto || isNaN(Number(monto))) {
    return NextResponse.json({ error: 'monto es requerido' }, { status: 400 })
  }

  const { admin } = auth
  const { data: inv } = await admin.from('invoices').select('id').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })

  const { data, error } = await admin
    .from('payments')
    .insert({
      invoice_id:       id,
      descripcion,
      monto:            Number(monto),
      fecha_vencimiento: fecha_vencimiento ?? null,
      fecha_pago:       fecha_pago ?? null,
      metodo_pago:      metodo_pago ?? null,
      notas:            notas ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalcEstado(admin, id)

  return NextResponse.json({ data }, { status: 201 })
}

async function recalcEstado(admin: AdminClient, invoiceId: string) {
  const [{ data: payments }, { data: items }] = await Promise.all([
    admin.from('payments').select('monto, fecha_pago').eq('invoice_id', invoiceId),
    admin.from('invoice_items').select('cantidad, precio_unitario').eq('invoice_id', invoiceId),
  ])

  const total  = (items ?? []).reduce((s, it) => s + it.cantidad * it.precio_unitario, 0)
  const pagado = (payments ?? []).filter(p => p.fecha_pago).reduce((s, p) => s + p.monto, 0)

  if (total <= 0) return

  let estado: string
  if (pagado >= total)   estado = 'pagada'
  else if (pagado > 0)   estado = 'parcialmente_pagada'
  else return

  await admin.from('invoices').update({ estado }).eq('id', invoiceId)
}
