import { NextRequest, NextResponse } from 'next/server'
import { requireBillingAccess } from '@/lib/billing-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getArgentinaDate } from '@/lib/timezone'

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
  const {
    descripcion = 'Pago', monto, fecha_vencimiento, fecha_pago, metodo_pago, notas,
    numero_factura, factura_enviada_at, attachments = [],
  } = body

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
      numero_factura:   numero_factura ?? null,
      factura_enviada_at: factura_enviada_at ?? null,
      attachments,
      notas:            notas ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalcEstado(admin, id)

  return NextResponse.json({ data }, { status: 201 })
}

export async function recalcEstado(admin: AdminClient, invoiceId: string) {
  const [{ data: payments }, { data: inv }] = await Promise.all([
    admin.from('payments').select('monto, fecha_pago, fecha_vencimiento').eq('invoice_id', invoiceId),
    admin.from('invoices').select('estado').eq('id', invoiceId).maybeSingle(),
  ])

  if (!inv || inv.estado === 'cancelada') return

  const total  = (payments ?? []).reduce((s, p) => s + p.monto, 0)
  const pagado = (payments ?? []).filter(p => p.fecha_pago).reduce((s, p) => s + p.monto, 0)

  if (total <= 0) return

  const today = getArgentinaDate().toISOString().slice(0, 10)
  const hasOverdue = (payments ?? []).some(p => !p.fecha_pago && p.fecha_vencimiento && p.fecha_vencimiento < today)

  let estado: string
  if (pagado >= total)   estado = 'cobrado'
  else if (hasOverdue)   estado = 'vencido'
  else if (pagado > 0)   estado = 'parcial'
  else                   estado = 'pendiente'

  await admin.from('invoices').update({ estado }).eq('id', invoiceId)
}
