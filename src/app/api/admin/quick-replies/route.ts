import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_ROLES = ['admin', 'sales']

async function requireCrm() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', status: 401 as const }
  const admin = createAdminClient()
  const { data } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (!ALLOWED_ROLES.includes(data?.role ?? '')) return { error: 'Sin permisos', status: 403 as const }
  return { admin }
}

export async function GET() {
  const auth = await requireCrm()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data } = await auth.admin
    .from('quick_replies')
    .select('id, titulo, cuerpo, created_at')
    .order('created_at', { ascending: true })

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireCrm()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { titulo, cuerpo } = await req.json() as { titulo?: string; cuerpo?: string }
  if (!titulo?.trim() || !cuerpo?.trim()) {
    return NextResponse.json({ error: 'Título y cuerpo son requeridos' }, { status: 400 })
  }

  const { data, error } = await auth.admin
    .from('quick_replies')
    .insert({ titulo: titulo.trim(), cuerpo: cuerpo.trim() })
    .select('id, titulo, cuerpo, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
