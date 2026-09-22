import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_EMOJIS = ['👍', '❤️', '🔥', '✅']
const CLIENT_ID = 'client'
type Params = { params: Promise<{ token: string; commentId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token, commentId } = await params
  const admin = createAdminClient()

  const { data: ticket, error: ticketErr } = await admin
    .from('tickets')
    .select('id,estado')
    .eq('ticket_token', token)
    .is('deleted_at', null)
    .single()

  if (ticketErr || !ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })
  if (['resuelto', 'cerrado'].includes(ticket.estado)) {
    return NextResponse.json({ error: 'Este ticket está cerrado' }, { status: 400 })
  }

  const { emoji } = await req.json() as { emoji: string }
  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return NextResponse.json({ error: 'Emoji no permitido' }, { status: 400 })
  }

  const { data: comment } = await admin
    .from('ticket_comments')
    .select('reactions, ticket_id')
    .eq('id', commentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!comment) return NextResponse.json({ error: 'Comentario no encontrado' }, { status: 404 })
  if (comment.ticket_id !== ticket.id) return NextResponse.json({ error: 'Comentario no encontrado' }, { status: 404 })

  const reactions: Record<string, string[]> = (comment.reactions as Record<string, string[]>) ?? {}
  const users = reactions[emoji] ?? []
  if (users.includes(CLIENT_ID)) {
    reactions[emoji] = users.filter(u => u !== CLIENT_ID)
  } else {
    reactions[emoji] = [...users, CLIENT_ID]
  }
  if (reactions[emoji].length === 0) delete reactions[emoji]

  const { data: updated, error } = await admin
    .from('ticket_comments')
    .update({ reactions })
    .eq('id', commentId)
    .select('reactions')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: updated.reactions })
}
