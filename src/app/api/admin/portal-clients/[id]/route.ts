import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPassword } from '@/lib/portal-auth'

type Params = { params: Promise<{ id: string }> }

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', status: 401 as const }
  const admin = createAdminClient()
  const { data } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (data?.role !== 'admin') return { error: 'Solo administradores', status: 403 as const }
  return { admin }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin } = auth

  const body = await req.json()
  const ALLOWED = ['nombre', 'empresa', 'plan_horas_mensual', 'password', 'color_acento', 'nombre_plan', 'mensaje_bienvenida', 'logo_url', 'manager_nombre', 'manager_avatar', 'project_id']
  const updates: Record<string, unknown> = {}

  for (const key of ALLOWED) {
    if (key in body && key !== 'password') {
      updates[key] = body[key]
    }
  }

  if ('password' in body) {
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ error: 'Contraseña mínimo 8 caracteres' }, { status: 400 })
    }
    updates.password_hash = await hashPassword(body.password)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('portal_clients')
    .update(updates)
    .eq('id', id)
    .select('id, email, nombre, empresa, plan_horas_mensual, color_acento, nombre_plan, mensaje_bienvenida, logo_url, manager_nombre, manager_avatar, project_id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin } = auth

  // Sessions are deleted by CASCADE on portal_clients FK
  const { error } = await admin.from('portal_clients').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
