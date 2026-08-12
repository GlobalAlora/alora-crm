import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { notifyAll } from '@/lib/push-notify'

const INTERNAL_EMAIL = 'somosglobalalora@gmail.com'
const INTERNAL_CC    = 'bruno@globalalora.com'
type Params = { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: ticket, error: ticketErr } = await admin
    .from('tickets')
    .select('id,numero,titulo,client_nombre,client_email,estado')
    .eq('ticket_token', token)
    .is('deleted_at', null)
    .single()

  if (ticketErr || !ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  if (['resuelto', 'cerrado'].includes(ticket.estado)) {
    return NextResponse.json({ error: 'Este ticket está cerrado' }, { status: 400 })
  }

  const { body, client_nombre, attachments } = await req.json() as { body: string; client_nombre?: string; attachments?: { url: string; name: string; type: string }[] }
  if (!body?.trim() && !attachments?.length) return NextResponse.json({ error: 'El mensaje no puede estar vacío' }, { status: 400 })

  const { data: comment, error } = await admin
    .from('ticket_comments')
    .insert({
      ticket_id:     ticket.id,
      body:          body?.trim() ?? '',
      is_client:     true,
      client_nombre: client_nombre?.trim() ?? ticket.client_nombre ?? 'Cliente',
      attachments:   attachments ?? [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Client replied — reset inactivity clock and clear any pending followup
  await admin
    .from('tickets')
    .update({ last_client_activity_at: new Date().toISOString(), followup_sent_at: null })
    .eq('id', ticket.id)

  // Notify internal team
  notifyAll({
    title: `💬 ${ticket.client_nombre ?? 'Cliente'} respondió en ${ticket.numero}`,
    body:  body.trim().slice(0, 100),
    url:   `/tickets/${ticket.id}`,
  }).catch(() => {})

  sendGmail({
    from:    'info@globalalora.com',
    to:      INTERNAL_EMAIL,
    cc:      INTERNAL_CC,
    subject: `[${ticket.numero}] Nuevo mensaje del cliente`,
    html: `<div style="font-family:sans-serif;max-width:600px">
      <p><strong>${ticket.client_nombre ?? 'El cliente'}</strong> dejó un comentario en el ticket <strong>${ticket.numero}</strong>:</p>
      <blockquote style="border-left:3px solid #3b82f6;margin:12px 0;padding:8px 16px;color:#475569">${body.trim().replace(/\n/g, '<br>')}</blockquote>
      <p style="font-size:13px;color:#94a3b8">Ticket: ${ticket.titulo}</p>
    </div>`,
  }).catch(() => {})

  return NextResponse.json({
    data: {
      id:          comment.id,
      body:        comment.body,
      is_client:   true,
      author_name: comment.client_nombre ?? 'Cliente',
      created_at:  comment.created_at,
    }
  }, { status: 201 })
}
