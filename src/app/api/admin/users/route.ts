import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', status: 401 as const }
  const admin = createAdminClient()
  const { data } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (data?.role !== 'admin') return { error: 'Solo administradores', status: 403 as const }
  return { currentUser: user, admin }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { admin } = auth

  // Auth users list
  const { data: { users: authUsers }, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  // CRM users (role, name)
  const { data: crmUsers } = await admin.from('users').select('id, full_name, avatar_url, role')
  const crmMap = Object.fromEntries((crmUsers ?? []).map(u => [u.id, u]))

  const users = authUsers
    .filter(u => !u.banned_until || new Date(u.banned_until) < new Date())
    .map(u => ({
      id:          u.id,
      email:       u.email ?? '',
      full_name:   crmMap[u.id]?.full_name ?? (u.user_metadata?.full_name as string | undefined) ?? u.email ?? '',
      avatar_url:  crmMap[u.id]?.avatar_url ?? null,
      role:        crmMap[u.id]?.role ?? null,
      in_crm:      !!crmMap[u.id],
      last_sign_in: u.last_sign_in_at,
      created_at:  u.created_at,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  return NextResponse.json({ data: users })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { admin } = auth
  const body = await req.json() as { email?: string; full_name?: string; role?: string }

  if (!body.email?.trim() || !body.full_name?.trim()) {
    return NextResponse.json({ error: 'Email y nombre son requeridos' }, { status: 400 })
  }

  const email    = body.email.trim().toLowerCase()
  const fullName = body.full_name.trim()
  const role     = body.role ?? 'viewer'

  // Send invite email via Supabase Auth
  const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  })

  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 400 })

  // Register in CRM users table
  const { error: upsertErr } = await admin.from('users').upsert({
    id:        invite.user.id,
    full_name: fullName,
    role,
  })
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({
    data: { id: invite.user.id, email, full_name: fullName, role },
  }, { status: 201 })
}
