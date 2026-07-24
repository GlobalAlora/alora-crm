import { NextRequest, NextResponse } from 'next/server'
import { requireBillingAccess } from '@/lib/billing-auth'
import { sendGmail } from '@/lib/google-gmail'
import { buildInternalAlertHtml } from '@/lib/billing-emails'

const INTERNAL_EMAIL = 'somosglobalalora@gmail.com'

// POST /api/invoices/[id]/payments/[pid]/remind
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; pid: string }> }
) {
  const auth = await requireBillingAccess()
  if (auth.error) return auth.error

  const { id, pid } = await params
  const { admin } = auth

  const [{ data: invoice }, { data: payment }] = await Promise.all([
    admin.from('invoices').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
    admin.from('payments').select('*').eq('id', pid).eq('invoice_id', id).maybeSingle(),
  ])

  if (!invoice) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
  if (!payment) return NextResponse.json({ error: 'Cuota no encontrada' }, { status: 404 })
  if (payment.fecha_pago) return NextResponse.json({ error: 'Esta cuota ya está pagada' }, { status: 400 })

  await sendGmail({
    from:    'info@globalalora.com',
    to:      INTERNAL_EMAIL,
    subject: `📋 Recordatorio — ${invoice.numero} · ${invoice.cliente_nombre}`,
    html:    buildInternalAlertHtml({ invoices: [{ invoice, payments: [payment] }] }),
  })

  await admin
    .from('payments')
    .update({ alerta_enviada_at: new Date().toISOString() })
    .eq('id', pid)

  return NextResponse.json({ ok: true })
}
