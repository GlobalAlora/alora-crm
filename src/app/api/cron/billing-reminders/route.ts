/**
 * Daily cron — detecta pagos vencidos o próximos a vencer y manda
 * un digest interno a somosglobalalora@gmail.com.
 * Schedule: 0 12 * * * (mediodía UTC = 9am Argentina)
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { buildInternalAlertHtml } from '@/lib/billing-emails'

const INTERNAL_EMAIL = 'somosglobalalora@gmail.com'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date()

  const { data: invoices, error } = await admin
    .from('invoices')
    .select('*')
    .is('deleted_at', null)
    .eq('alertas_activas', true)
    .in('estado', ['enviada', 'parcialmente_pagada', 'vencida'])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!invoices?.length) return NextResponse.json({ ok: true, processed: 0 })

  const invoiceIds = invoices.map(i => i.id)
  const { data: allPayments } = await admin
    .from('payments')
    .select('*')
    .in('invoice_id', invoiceIds)
    .is('fecha_pago', null)
    .not('fecha_vencimiento', 'is', null)

  if (!allPayments?.length) return NextResponse.json({ ok: true, processed: 0 })

  const invoiceMap = Object.fromEntries(invoices.map(i => [i.id, i]))

  const dueSoon = allPayments.filter(p => {
    const inv  = invoiceMap[p.invoice_id]
    if (!inv) return false

    const due  = new Date(p.fecha_vencimiento!)
    const diff = Math.floor((due.getTime() - today.getTime()) / 86_400_000)

    if (diff > (inv.dias_alerta ?? 3)) return false // todavía no es el momento
    if (diff < -30) return false                    // vencida hace más de 30 días, no spamear

    if (p.alerta_enviada_at) {
      const daysSince = (today.getTime() - new Date(p.alerta_enviada_at).getTime()) / 86_400_000
      if (daysSince < 6) return false               // ya avisamos esta semana
    }

    return true
  })

  if (!dueSoon.length) {
    return NextResponse.json({ ok: true, processed: 0, message: 'Sin pagos que alertar hoy' })
  }

  // Agrupar por factura para el digest
  const grouped: Record<string, typeof dueSoon> = {}
  for (const p of dueSoon) {
    if (!grouped[p.invoice_id]) grouped[p.invoice_id] = []
    grouped[p.invoice_id].push(p)
  }

  const digestGroups = Object.entries(grouped).map(([invoiceId, payments]) => ({
    invoice: invoiceMap[invoiceId],
    payments,
  }))

  try {
    await sendGmail({
      from:    'info@globalalora.com',
      to:      INTERNAL_EMAIL,
      subject: `⚠️ ${dueSoon.length} pago${dueSoon.length !== 1 ? 's' : ''} pendiente${dueSoon.length !== 1 ? 's' : ''} — Alora CRM`,
      html:    buildInternalAlertHtml({ invoices: digestGroups }),
    })
  } catch (e) {
    console.error('[billing-cron] email error', e)
    return NextResponse.json({ error: 'Email fallido' }, { status: 500 })
  }

  // Marcar alerta enviada en todos los pagos del digest
  await Promise.all(
    dueSoon.map(p =>
      admin.from('payments').update({ alerta_enviada_at: today.toISOString() }).eq('id', p.id)
    )
  )

  return NextResponse.json({ ok: true, processed: dueSoon.length })
}
