import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

async function getAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: row } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  return { user, admin, role: row?.role ?? 'viewer' }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await auth.admin
    .from('project_members')
    .select('id, user_id, role, created_at')
    .eq('project_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with user names
  const userIds = (data ?? []).map(m => m.user_id)
  let usersMap: Record<string, { full_name: string; avatar_url: string | null }> = {}
  if (userIds.length > 0) {
    const { data: users } = await auth.admin
      .from('users')
      .select('id, full_name, avatar_url')
      .in('id', userIds)
    usersMap = Object.fromEntries((users ?? []).map(u => [u.id, u]))
  }

  const members = (data ?? []).map(m => ({
    ...m,
    user: usersMap[m.user_id] ?? null,
  }))

  return NextResponse.json({ data: members })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Only admins can manage members
  if (!['admin', 'sales'].includes(auth.role)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const body = await req.json() as { user_id: string; role?: string }
  if (!body.user_id) return NextResponse.json({ error: 'user_id requerido' }, { status: 400 })

  const { data, error } = await auth.admin
    .from('project_members')
    .upsert({ project_id: id, user_id: body.user_id, role: body.role ?? 'member' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params
  const auth = await getAuth()
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!['admin', 'sales'].includes(auth.role)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id requerido' }, { status: 400 })

  const { error } = await auth.admin
    .from('project_members')
    .delete()
    .eq('project_id', id)
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
