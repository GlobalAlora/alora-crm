/**
 * Daily cron — detecta tickets inactivos esperando respuesta del cliente.
 * - 2 días sin respuesta: manda recordatorio al cliente
 * - 5 días sin respuesta: cierra el ticket y notifica al cliente
 * Schedule: 0 13 * * * (13h UTC = 10am Argentina)
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { buildFollowupReminderHtml, buildTicketClosedInactivityHtml, PORTAL_URL } from '@/lib/ticket-emails'

const FOLLOWUP_DAYS = 2
const CLOSE_DAYS    = 5

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()

  // Tickets abiertos con email de cliente
  const { data: tickets, error } = await admin
    .from('tickets')
    .select('id, numero, titulo, client_email, client_nombre, ticket_token, followup_sent_at, last_client_activity_at')
    .not('client_email', 'is', null)
    .not('ticket_token', 'is', null)
    .not('estado', 'in', '("cerrado","resuelto")')
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!tickets?.length) return NextResponse.json({ ok: true, processed: 0 })

  // Último comentario del equipo por ticket
  const { data: teamComments } = await admin
    .from('ticket_comments')
    .select('ticket_id, created_at')
    .in('ticket_id', tickets.map(t => t.id))
    .eq('is_client', false)
    .order('created_at', { ascending: false })

  // Mapa: ticket_id → fecha del último comentario del equipo
  const lastTeamReply: Record<string, Date> = {}
  for (const c of teamComments ?? []) {
    if (!lastTeamReply[c.ticket_id]) {
      lastTeamReply[c.ticket_id] = new Date(c.created_at)
    }
  }

  let reminders = 0
  let closed = 0

  for (const ticket of tickets) {
    const teamRepliedAt = lastTeamReply[ticket.id]
    if (!teamRepliedAt) continue // el equipo aún no respondió, no hay nada que seguir

    const clientActivityAt = ticket.last_client_activity_at
      ? new Date(ticket.last_client_activity_at)
      : null

    // El reloj empieza cuando el equipo respondió y el cliente aún no
    if (clientActivityAt && clientActivityAt >= teamRepliedAt) continue

    const daysSinceTeamReply = (now.getTime() - teamRepliedAt.getTime()) / 86_400_000
    const trackingUrl = `${PORTAL_URL}/ticket-portal/${ticket.ticket_token}`

    if (daysSinceTeamReply >= CLOSE_DAYS) {
      // Cerrar ticket
      await admin
        .from('tickets')
        .update({ estado: 'cerrado', resolved_at: now.toISOString() })
        .eq('id', ticket.id)

      sendGmail({
        from:    'info@globalalora.com',
        to:      ticket.client_email!,
        subject: `Tu ticket ${ticket.numero} fue cerrado — Alora Soporte`,
        html:    buildTicketClosedInactivityHtml({
          numero:       ticket.numero,
          titulo:       ticket.titulo,
          client_nombre: ticket.client_nombre,
          trackingUrl,
        }),
      }).catch(() => {})

      closed++

    } else if (daysSinceTeamReply >= FOLLOWUP_DAYS && !ticket.followup_sent_at) {
      // Recordatorio de seguimiento (solo una vez)
      await admin
        .from('tickets')
        .update({ followup_sent_at: now.toISOString() })
        .eq('id', ticket.id)

      sendGmail({
        from:    'info@globalalora.com',
        to:      ticket.client_email!,
        subject: `¿Pudiste ver nuestra respuesta? — Ticket ${ticket.numero}`,
        html:    buildFollowupReminderHtml({
          numero:       ticket.numero,
          titulo:       ticket.titulo,
          client_nombre: ticket.client_nombre,
          trackingUrl,
        }),
      }).catch(() => {})

      reminders++
    }
  }

  return NextResponse.json({ ok: true, reminders, closed })
}
