import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { buildHorasAprobadasAdminHtml } from '@/lib/ticket-emails'
import { notifyAll } from '@/lib/push-notify'

const INTERNAL_EMAIL = 'somosglobalalora@gmail.com'
const INTERNAL_CC    = 'bruno@globalalora.com'
type Params = { params: Promise<{ token: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: ticket, error } = await admin
    .from('tickets')
    .select('id, numero, titulo, horas_estimadas, horas_aprobadas, client_nombre, client_email')
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

  // Notify admin team
  notifyAll({
    title: `✅ ${ticket.client_nombre ?? 'Cliente'} aprobó ${ticket.horas_estimadas} hs`,
    body:  `Ticket ${ticket.numero} — ${ticket.titulo}`,
    url:   `/tickets/${ticket.id}`,
  }).catch(() => {})

  sendGmail({
    from:    'info@globalalora.com',
    to:      INTERNAL_EMAIL,
    cc:      INTERNAL_CC,
    subject: `[${ticket.numero}] ${ticket.client_nombre ?? 'Cliente'} aprobó ${ticket.horas_estimadas} hs`,
    html:    buildHorasAprobadasAdminHtml({
      numero:          ticket.numero,
      titulo:          ticket.titulo,
      client_nombre:   ticket.client_nombre,
      client_email:    ticket.client_email,
      horas_estimadas: ticket.horas_estimadas,
    }),
  }).catch(() => {})

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: ticket, error } = await admin
    .from('tickets')
    .select('id, numero, titulo, horas_estimadas, horas_aprobadas, client_nombre, client_email')
    .eq('ticket_token', token)
    .is('deleted_at', null)
    .single()

  if (error || !ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })
  if (ticket.horas_aprobadas) return NextResponse.json({ error: 'Las horas ya fueron aprobadas' }, { status: 400 })

  const { error: updateErr } = await admin
    .from('tickets')
    .update({ horas_aprobadas: false, estado: 'en_espera' })
    .eq('id', ticket.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  notifyAll({
    title: `❌ ${ticket.client_nombre ?? 'Cliente'} rechazó ${ticket.horas_estimadas} hs`,
    body:  `Ticket ${ticket.numero} — ${ticket.titulo}`,
    url:   `/tickets/${ticket.id}`,
  }).catch(() => {})

  sendGmail({
    from:    'info@globalalora.com',
    to:      INTERNAL_EMAIL,
    cc:      INTERNAL_CC,
    subject: `[${ticket.numero}] ${ticket.client_nombre ?? 'Cliente'} rechazó la estimación de ${ticket.horas_estimadas} hs`,
    html:    `<p><strong>${ticket.client_nombre ?? 'El cliente'}</strong> rechazó la estimación de <strong>${ticket.horas_estimadas} hs</strong> para el ticket <strong>${ticket.numero} — ${ticket.titulo}</strong>. Revisá con el cliente antes de continuar.</p>`,
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
