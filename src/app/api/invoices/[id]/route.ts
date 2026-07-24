import { NextRequest, NextResponse } from 'next/server'
import { requireBillingAccess } from '@/lib/billing-auth'

// GET /api/invoices/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBillingAccess()
  if (auth.error) return auth.error

  const { id } = await params
  const { admin } = auth

  const { data: invoice, error } = await admin
    .from('invoices')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !invoice) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  const [{ data: items }, { data: payments }, { data: project }] = await Promise.all([
    admin.from('invoice_items').select('*').eq('invoice_id', id).order('position'),
    admin.from('payments').select('*').eq('invoice_id', id).order('created_at'),
    invoice.project_id
      ? admin.from('projects').select('id, nombre, color').eq('id', invoice.project_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const total        = (items ?? []).reduce((s, it) => s + it.cantidad * it.precio_unitario, 0)
  const total_pagado = (payments ?? []).filter(p => p.fecha_pago).reduce((s, p) => s + p.monto, 0)

  return NextResponse.json({
    data: { ...invoice, items: items ?? [], payments: payments ?? [], project: project ?? null, total, total_pagado },
  })
}

// PATCH /api/invoices/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBillingAccess()
  if (auth.error) return auth.error

  const { id } = await params
  const body = await req.json()

  const allowed = [
    'estado', 'cliente_nombre', 'cliente_email', 'descripcion', 'moneda',
    'fecha_emision', 'fecha_vencimiento', 'notas', 'project_id',
    'alertas_activas', 'dias_alerta',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { admin } = auth
  const { data, error } = await admin
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE /api/invoices/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBillingAccess()
  if (auth.error) return auth.error

  const { id } = await params
  const { admin } = auth

  const { error } = await admin
    .from('invoices')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
