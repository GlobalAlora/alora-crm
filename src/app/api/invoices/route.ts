import { NextRequest, NextResponse } from 'next/server'
import { requireBillingAccess } from '@/lib/billing-auth'

// GET /api/invoices
export async function GET(req: NextRequest) {
  const auth = await requireBillingAccess()
  if (auth.error) return auth.error

  const { admin } = auth
  const { searchParams } = new URL(req.url)
  const estado     = searchParams.get('estado')
  const project_id = searchParams.get('project_id')

  let q = admin
    .from('invoices')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (estado)     q = q.eq('estado', estado)
  if (project_id) q = q.eq('project_id', project_id)

  const { data: invoices, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!invoices?.length) return NextResponse.json({ data: [] })

  const ids = invoices.map(i => i.id)

  const [{ data: payments }, { data: projects }] = await Promise.all([
    admin.from('payments').select('*').in('invoice_id', ids).order('created_at'),
    admin.from('projects').select('id, nombre, color').in('id', invoices.map(i => i.project_id).filter(Boolean)),
  ])

  const projectMap = Object.fromEntries((projects ?? []).map(p => [p.id, p]))

  const enriched = invoices.map(inv => {
    const invPayments = (payments ?? []).filter(p => p.invoice_id === inv.id)
    const total       = invPayments.reduce((s, p) => s + p.monto, 0)
    const total_pagado = invPayments.filter(p => p.fecha_pago).reduce((s, p) => s + p.monto, 0)
    return {
      ...inv,
      payments: invPayments,
      project:  inv.project_id ? (projectMap[inv.project_id] ?? null) : null,
      total,
      total_pagado,
    }
  })

  return NextResponse.json({ data: enriched })
}

// POST /api/invoices
export async function POST(req: NextRequest) {
  const auth = await requireBillingAccess()
  if (auth.error) return auth.error

  const { user, admin } = auth
  const body = await req.json()
  const {
    project_id, lead_id, cliente_nombre, cliente_email, cliente_telefono,
    cliente_razon_social, cliente_cuit, cliente_condicion_iva, cliente_domicilio,
    descripcion, moneda = 'USD', estado = 'pendiente',
    fecha_emision, notas,
    alertas_activas = true, dias_alerta = 3,
    payments = [],
  } = body

  if (!cliente_nombre?.trim()) {
    return NextResponse.json({ error: 'cliente_nombre es requerido' }, { status: 400 })
  }

  // Generate invoice number FAC-YYYY-NNN
  const year = new Date().getFullYear()
  const { data: lastRows } = await admin
    .from('invoices')
    .select('numero')
    .like('numero', `FAC-${year}-%`)
    .is('deleted_at', null)
    .order('numero', { ascending: false })
    .limit(1)

  const lastSeq = lastRows?.[0]
    ? parseInt(lastRows[0].numero.split('-')[2] ?? '0', 10)
    : 0
  const numero = `FAC-${year}-${String(lastSeq + 1).padStart(3, '0')}`

  const { data: invoice, error } = await admin
    .from('invoices')
    .insert({
      project_id:       project_id ?? null,
      lead_id:          lead_id ?? null,
      numero,
      cliente_nombre:   cliente_nombre.trim(),
      cliente_email:    cliente_email ?? null,
      cliente_telefono: cliente_telefono ?? null,
      cliente_razon_social: cliente_razon_social ?? null,
      cliente_cuit:     cliente_cuit ?? null,
      cliente_condicion_iva: cliente_condicion_iva ?? null,
      cliente_domicilio: cliente_domicilio ?? null,
      descripcion:      descripcion ?? null,
      moneda,
      estado,
      fecha_emision:    fecha_emision ?? new Date().toISOString().slice(0, 10),
      notas:            notas ?? null,
      alertas_activas,
      dias_alerta,
      created_by:       user.id,
    })
    .select()
    .single()

  if (error || !invoice) {
    return NextResponse.json({ error: error?.message ?? 'Error al crear cliente' }, { status: 500 })
  }

  if (payments.length > 0) {
    await admin.from('payments').insert(
      payments.map((p: { descripcion: string; monto: number; fecha_vencimiento?: string; metodo_pago?: string }) => ({
        invoice_id:       invoice.id,
        descripcion:      p.descripcion,
        monto:            p.monto,
        fecha_vencimiento: p.fecha_vencimiento ?? null,
        metodo_pago:      p.metodo_pago ?? null,
      }))
    )
  }

  return NextResponse.json({ data: invoice }, { status: 201 })
}
