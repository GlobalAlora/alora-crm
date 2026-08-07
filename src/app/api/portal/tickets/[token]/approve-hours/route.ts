import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ token: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: ticket, error } = await admin
    .from('tickets')
    .select('id, horas_estimadas, horas_aprobadas')
    .eq('ticket_token', token)
    .is('deleted_at', null)
    .single()

  if (error || !ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })
  if (!ticket.horas_estimadas) return NextResponse.json({ error: 'Este ticket no tiene horas estimadas' }, { status: 400 })
  if (ticket.horas_aprobadas) return NextResponse.json({ error: 'Las horas ya fueron aprobadas' }, { status: 400 })

  const { error: updateErr } = await admin
    .from('tickets')
    .update({ horas_aprobadas: true })
    .eq('id', ticket.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
