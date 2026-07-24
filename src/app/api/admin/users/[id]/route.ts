import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', status: 401 as const }
  const admin = createAdminClient()
  const { data } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (data?.role !== 'admin') return { error: 'Solo administradores', status: 403 as const }
  return { currentUser: user, admin }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json() as { role?: string; full_name?: string }
  const updates: Record<string, unknown> = {}
  if (body.role)      updates.role      = body.role
  if (body.full_name) updates.full_name = body.full_name

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const { error } = await auth.admin.from('users').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (id === auth.currentUser.id) {
    return NextResponse.json({ error: 'No puedes eliminar tu propio usuario' }, { status: 400 })
  }

  // Remove from CRM
  await auth.admin.from('users').delete().eq('id', id)

  // Ban auth user (10 years = effectively permanent)
  await auth.admin.auth.admin.updateUserById(id, { ban_duration: '87600h' })

  return NextResponse.json({ success: true })
}
