import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPassword } from '@/lib/portal-auth'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', status: 401 as const }
  const admin = createAdminClient()
  const { data } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (data?.role !== 'admin') return { error: 'Solo administradores', status: 403 as const }
  return { admin }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin } = auth

  const { data: clients, error } = await admin
    .from('portal_clients')
    .select('id, email, nombre, empresa, plan_horas_mensual, color_acento, nombre_plan, mensaje_bienvenida, logo_url, manager_nombre, manager_avatar, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!clients?.length) return NextResponse.json({ data: [] })

  const emails = clients.map(c => c.email)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  // Fetch tickets for all portal clients
  const [{ data: allTickets }, { data: monthTickets }] = await Promise.all([
    admin
      .from('tickets')
      .select('client_email, estado')
      .in('client_email', emails)
      .is('deleted_at', null),
    admin
      .from('tickets')
      .select('client_email, horas_reales')
      .in('client_email', emails)
      .in('estado', ['resuelto', 'cerrado'])
      .gte('resolved_at', monthStart)
      .lt('resolved_at', monthEnd)
      .is('deleted_at', null),
  ])

  // Aggregate per email
  const openByEmail: Record<string, number> = {}
  const totalByEmail: Record<string, number> = {}
  for (const t of allTickets ?? []) {
    if (!t.client_email) continue
    totalByEmail[t.client_email] = (totalByEmail[t.client_email] ?? 0) + 1
    if (!['resuelto', 'cerrado'].includes(t.estado)) {
      openByEmail[t.client_email] = (openByEmail[t.client_email] ?? 0) + 1
    }
  }

  const horasByEmail: Record<string, number> = {}
  for (const t of monthTickets ?? []) {
    if (!t.client_email) continue
    horasByEmail[t.client_email] = (horasByEmail[t.client_email] ?? 0) + (Number(t.horas_reales) || 0)
  }

  const data = clients.map(c => ({
    ...c,
    tickets_abiertos: openByEmail[c.email] ?? 0,
    tickets_total:    totalByEmail[c.email] ?? 0,
    horas_mes:        horasByEmail[c.email] ?? 0,
  }))

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin } = auth

  const { email, password, nombre, empresa, plan_horas_mensual } = await req.json()

  if (!email?.trim() || !password || !nombre?.trim()) {
    return NextResponse.json({ error: 'Email, contraseña y nombre son requeridos' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Contraseña mínimo 8 caracteres' }, { status: 400 })
  }

  const { data: existing } = await admin
    .from('portal_clients')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Ya existe una cuenta con ese email' }, { status: 409 })

  const passwordHash = await hashPassword(password)

  const { data: client, error } = await admin
    .from('portal_clients')
    .insert({
      email:              email.toLowerCase().trim(),
      password_hash:      passwordHash,
      nombre:             nombre.trim(),
      empresa:            empresa?.trim() || null,
      plan_horas_mensual: Number(plan_horas_mensual) || 20,
    })
    .select('id, email, nombre, empresa, plan_horas_mensual, color_acento, nombre_plan, mensaje_bienvenida, logo_url, manager_nombre, manager_avatar, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ...client, tickets_abiertos: 0, tickets_total: 0, horas_mes: 0 } }, { status: 201 })
}
