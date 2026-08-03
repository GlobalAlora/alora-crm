import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: comments, error } = await admin
    .from('project_task_comments')
    .select('*')
    .eq('task_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = [...new Set(comments.map((c: { user_id: string }) => c.user_id).filter(Boolean))] as string[]
  let userMap: Record<string, { id: string; full_name: string; avatar_url: string | null }> = {}
  if (userIds.length) {
    const { data: users } = await admin.from('users').select('id,full_name,avatar_url').in('id', userIds)
    userMap = Object.fromEntries((users ?? []).map((u: { id: string; full_name: string; avatar_url: string | null }) => [u.id, u]))
  }

  return NextResponse.json({
    data: comments.map((c: Record<string, unknown>) => ({ ...c, user: c.user_id ? userMap[c.user_id as string] ?? null : null })),
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { body: text, attachments } = await req.json() as { body: string; attachments?: unknown[] }
  if (!text?.trim() && !(attachments?.length)) return NextResponse.json({ error: 'El comentario no puede estar vacío' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('project_task_comments')
    .insert({ task_id: id, user_id: user.id, body: text?.trim() ?? '', attachments: attachments ?? [] })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: userData } = await admin.from('users').select('id,full_name,avatar_url').eq('id', user.id).maybeSingle()

  return NextResponse.json({ data: { ...data, user: userData ?? null } }, { status: 201 })
}
