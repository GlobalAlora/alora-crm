import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'

const ALLOWED_ROLES = ['admin', 'sales']
const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ticket.globalalora.com'
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

  const { body: text } = await req.json() as { body: string }
  if (!text?.trim()) return NextResponse.json({ error: 'El comentario no puede estar vacío' }, { status: 400 })

  const { data, error } = await admin
    .from('ticket_comments')
    .insert({ ticket_id: id, user_id: user.id, body: text.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const [userDataRes, ticketRes] = await Promise.all([
    admin.from('users').select('id,full_name,avatar_url').eq('id', user.id).maybeSingle(),
    admin.from('tickets').select('numero,titulo,client_email,client_nombre,ticket_token').eq('id', id).maybeSingle(),
  ])

  const ticket = ticketRes.data
  if (ticket?.client_email && ticket?.ticket_token) {
    const trackingUrl = `${PORTAL_URL}/${ticket.ticket_token}`
    sendGmail({
      from:    'info@globalalora.com',
      to:      ticket.client_email,
      subject: `Re: ${ticket.numero} — ${ticket.titulo}`,
      html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">Alora — Centro de Soporte</h2>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
    <p style="font-size:15px;color:#1e293b">Hola${ticket.client_nombre ? ` <strong>${ticket.client_nombre}</strong>` : ''},</p>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      Nuestro equipo respondió a tu ticket <strong>${ticket.numero}</strong>.
    </p>
    <div style="background:#f8fafc;border-left:3px solid #3b82f6;border-radius:4px;padding:14px 18px;margin:20px 0">
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;white-space:pre-wrap">${text.trim().replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
    </div>
    <a href="${trackingUrl}" style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
      Ver conversación completa →
    </a>
    <p style="font-size:13px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:16px;margin:24px 0 0">
      Alora Digital · <a href="https://globalalora.com" style="color:#3b82f6">globalalora.com</a>
    </p>
  </div>
</div>`,
    }).catch(() => {})
  }

  return NextResponse.json({ data: { ...data, user: userDataRes.data ?? null } }, { status: 201 })
}
