/**
 * Daily cron — keeps recurring "Mantenimiento" clients topped up with
 * generated payment installments N months ahead (MESES_ADELANTADOS),
 * so the schedule never runs out as time passes without anyone having
 * to manually add cuotas every month.
 * Schedule: 0 11 * * * (11am UTC = 8am Argentina)
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { addMonths, getDaysInMonth, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseLocalDate } from '@/lib/utils'

const MESES_ADELANTADOS = 12

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: invoices, error } = await admin
    .from('invoices')
    .select('id, dia_cobro, monto_recurrente, moneda')
    .is('deleted_at', null)
    .eq('tipo_cobranza', 'recurrente')
    .eq('mantenimiento_activo', true)
    .not('dia_cobro', 'is', null)
    .not('monto_recurrente', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!invoices?.length) return NextResponse.json({ ok: true, generated: 0 })

  const today = new Date()
  const targetMonth = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), MESES_ADELANTADOS)

  let generated = 0

  for (const inv of invoices) {
    const { data: existing } = await admin
      .from('payments')
      .select('fecha_vencimiento')
      .eq('invoice_id', inv.id)
      .not('fecha_vencimiento', 'is', null)
      .order('fecha_vencimiento', { ascending: false })
      .limit(1)

    const lastDue = existing?.[0]?.fecha_vencimiento
      ? parseLocalDate(existing[0].fecha_vencimiento)
      : new Date(today.getFullYear(), today.getMonth(), 1)

    let cursor = new Date(lastDue.getFullYear(), lastDue.getMonth() + 1, 1)
    const toInsert: { invoice_id: string; descripcion: string; monto: number; fecha_vencimiento: string }[] = []

    while (cursor <= targetMonth) {
      const day = Math.min(inv.dia_cobro, getDaysInMonth(cursor))
      const due = new Date(cursor.getFullYear(), cursor.getMonth(), day)
      const label = format(due, 'MMMM yyyy', { locale: es })
      toInsert.push({
        invoice_id:        inv.id,
        descripcion:       `Mantenimiento ${label.charAt(0).toUpperCase()}${label.slice(1)}`,
        monto:             inv.monto_recurrente,
        fecha_vencimiento: due.toISOString().slice(0, 10),
      })
      cursor = addMonths(cursor, 1)
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await admin.from('payments').insert(toInsert)
      if (!insertError) generated += toInsert.length
      else console.error('[maintenance-billing] insert error for invoice', inv.id, insertError.message)
    }
  }

  return NextResponse.json({ ok: true, generated })
}
