import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { PORTAL_URL, buildTeamReplyHtml } from '@/lib/ticket-emails'
import { getTicketBrand } from '@/lib/ticket-brand'
import { notifyLidiaWhatsApp } from '@/lib/lidia-notify'

const ALLOWED_ROLES = ['admin', 'sales']
type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { data: comments, error } = await admin
    .from('ticket_comments')
    .select('*')
    .eq('ticket_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set(comments.map(c => c.user_id).filter(Boolean))] as string[]
  let userMap: Record<string, { id: string; full_name: string; avatar_url: string | null }> = {}
  if (userIds.length) {
    const { data: users } = await admin.from('users').select('id,full_name,avatar_url').in('id', userIds)
    userMap = Object.fromEntries((users ?? []).map(u => [u.id, u]))
  }

  return NextResponse.json({
    data: comments.map(c => ({ ...c, user: c.user_id ? userMap[c.user_id] ?? null : null })),
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { body: text, is_internal, attachments } = await req.json() as { body: string; is_internal?: boolean; attachments?: { url: string; name: string; type: string }[] }
  if (!text?.trim() && !attachments?.length) return NextResponse.json({ error: 'El comentario no puede estar vacío' }, { status: 400 })

  const { data: userRow2 } = await admin.from('users').select('full_name').eq('id', user.id).maybeSingle()

  const { data, error } = await admin
    .from('ticket_comments')
    .insert({
      ticket_id:    id,
      user_id:      user.id,
      body:         text?.trim() ?? '',
      is_client:    false,
      client_nombre: userRow2?.full_name ?? null,
      attachments:  attachments ?? [],
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const [userDataRes, ticketRes] = await Promise.all([
    admin.from('users').select('id,full_name,avatar_url').eq('id', user.id).maybeSingle(),
    admin.from('tickets').select('numero,titulo,estado,client_email,client_nombre,ticket_token').eq('id', id).maybeSingle(),
  ])

  const ticket = ticketRes.data
  // Mark ticket as unread for client when team posts a public comment
  if (!is_internal) {
    void Promise.resolve(admin.from('tickets').update({ client_unread: true }).eq('id', id))
  }

  // Tickets que LIDIA creó por WhatsApp: la respuesta le llega a la clínica por WhatsApp (con el estado).
  // Si LIDIA no pudo mandarla, queda el mail de siempre como respaldo.
  const whatsapp = !is_internal && text?.trim()
    ? await notifyLidiaWhatsApp(admin, id, { comentario: text.trim(), estado: ticket?.estado })
    : 'skipped'

  if (!is_internal && whatsapp !== 'sent' && ticket?.client_email && ticket?.ticket_token) {
    const brand = await getTicketBrand(admin, id)
    sendGmail({
      from:    'info@globalalora.com',
      to:      ticket.client_email,
      subject: `Re: ${ticket.numero} — ${ticket.titulo}`,
      html:    buildTeamReplyHtml({
        numero:      ticket.numero,
        titulo:      ticket.titulo,
        client_nombre: ticket.client_nombre,
        commentText: text.trim(),
        trackingUrl: `${PORTAL_URL}/${ticket.ticket_token}`,
        brand,
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ data: { ...data, user: userDataRes.data ?? null, is_internal: !!is_internal } }, { status: 201 })
}
