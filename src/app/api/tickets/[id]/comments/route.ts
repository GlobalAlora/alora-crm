import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  const { data: userData } = await admin
    .from('users')
    .select('id,full_name,avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  return NextResponse.json({ data: { ...data, user: userData ?? null } }, { status: 201 })
}
