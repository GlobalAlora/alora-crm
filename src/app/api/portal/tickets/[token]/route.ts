import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ token: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: ticket, error } = await admin
    .from('tickets')
    .select('id,numero,titulo,descripcion,estado,prioridad,categoria,created_at,updated_at,resolved_at,client_nombre,ticket_token,horas_estimadas')
    .eq('ticket_token', token)
    .is('deleted_at', null)
    .single()

  if (error || !ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  // Mark as read by client (fire-and-forget)
  admin.from('tickets').update({ client_unread: false }).eq('id', ticket.id).then(() => {}).catch(() => {})

  const { data: comments } = await admin
    .from('ticket_comments')
    .select('id,body,is_client,client_nombre,created_at,user_id,attachments')
    .eq('ticket_id', ticket.id)
    .order('created_at', { ascending: true })

  const internalUserIds = [...new Set(
    (comments ?? []).filter(c => !c.is_client && c.user_id).map(c => c.user_id as string)
  )]

  let agentNames: Record<string, string> = {}
  if (internalUserIds.length) {
    const { data: users } = await admin
      .from('users')
      .select('id,full_name')
      .in('id', internalUserIds)
    agentNames = Object.fromEntries((users ?? []).map(u => [u.id, u.full_name]))
  }

  const enrichedComments = (comments ?? []).map(c => ({
    id:            c.id,
    body:          c.body,
    is_client:     c.is_client,
    author_name:   c.is_client ? (c.client_nombre ?? 'Cliente') : (c.user_id ? agentNames[c.user_id] ?? 'Equipo Alora' : 'Equipo Alora'),
    created_at:    c.created_at,
    attachments:   (c.attachments ?? []) as { url: string; name: string; type: string }[],
  }))

  return NextResponse.json({ data: { ...ticket, comments: enrichedComments } })
}
