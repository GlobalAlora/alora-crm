import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPortalClient, PORTAL_COOKIE } from '@/lib/portal-auth'

type Params = { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: ticket, error } = await admin
    .from('tickets')
    .select('id,numero,titulo,descripcion,estado,prioridad,categoria,created_at,updated_at,resolved_at,client_nombre,client_email,ticket_token,horas_estimadas,horas_aprobadas')
    .eq('ticket_token', token)
    .is('deleted_at', null)
    .single()

  if (error || !ticket) return NextResponse.json({ error: 'Ticket no encontrado' }, { status: 404 })

  // Only mark as read when the actual portal client is viewing (not admin impersonation)
  const sessionId = req.cookies.get(PORTAL_COOKIE)?.value
  const portalClient = sessionId ? await getPortalClient(sessionId) : null
  const isAdminPreview = portalClient?.is_admin_preview ?? false
  const isRealClient   = !isAdminPreview && portalClient?.email === ticket.client_email

  const [, portalClientRes] = await Promise.all([
    isRealClient
      ? Promise.resolve(admin.from('tickets').update({ client_unread: false }).eq('id', ticket.id))
      : Promise.resolve(null),
    admin.from('portal_clients').select('color_acento,logo_url').eq('email', ticket.client_email ?? '').maybeSingle(),
  ])

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

  return NextResponse.json({
    data: {
      ...ticket,
      comments:         enrichedComments,
      color_acento:     portalClientRes.data?.color_acento ?? null,
      logo_url:         portalClientRes.data?.logo_url ?? null,
      is_admin_preview: isAdminPreview,
    },
  })
}
