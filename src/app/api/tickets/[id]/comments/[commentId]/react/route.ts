import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_ROLES = ['admin', 'sales']
const ALLOWED_EMOJIS = ['👍', '❤️', '🔥', '✅']
type Params = { params: Promise<{ id: string; commentId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { commentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { emoji } = await req.json() as { emoji: string }
  if (!ALLOWED_EMOJIS.includes(emoji)) {
    return NextResponse.json({ error: 'Emoji no permitido' }, { status: 400 })
  }

  const { data: comment } = await admin
    .from('ticket_comments')
    .select('reactions')
    .eq('id', commentId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!comment) return NextResponse.json({ error: 'Comentario no encontrado' }, { status: 404 })

  const reactions: Record<string, string[]> = (comment.reactions as Record<string, string[]>) ?? {}
  const users = reactions[emoji] ?? []
  if (users.includes(user.id)) {
    reactions[emoji] = users.filter(u => u !== user.id)
  } else {
    reactions[emoji] = [...users, user.id]
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
