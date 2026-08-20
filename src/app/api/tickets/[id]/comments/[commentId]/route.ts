import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_ROLES = ['admin', 'sales']
type Params = { params: Promise<{ id: string; commentId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { commentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { data: comment } = await admin.from('ticket_comments').select('user_id').eq('id', commentId).is('deleted_at', null).maybeSingle()
  if (!comment) return NextResponse.json({ error: 'Comentario no encontrado' }, { status: 404 })
  if (comment.user_id !== user.id) {
    return NextResponse.json({ error: 'Solo podés editar tus propios comentarios' }, { status: 403 })
  }

  const { body: text } = await req.json() as { body: string }
  if (!text?.trim()) return NextResponse.json({ error: 'El comentario no puede quedar vacío' }, { status: 400 })

  const { data, error } = await admin
    .from('ticket_comments')
    .update({ body: text.trim(), updated_at: new Date().toISOString() })
    .eq('id', commentId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { commentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: userRow } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(userRow?.role ?? '')) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { data: comment } = await admin.from('ticket_comments').select('user_id').eq('id', commentId).is('deleted_at', null).maybeSingle()
  if (!comment) return NextResponse.json({ error: 'Comentario no encontrado' }, { status: 404 })
  if (comment.user_id !== user.id && userRow?.role !== 'admin') {
    return NextResponse.json({ error: 'Solo podés eliminar tus propios comentarios' }, { status: 403 })
  }

  const { error } = await admin
    .from('ticket_comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
