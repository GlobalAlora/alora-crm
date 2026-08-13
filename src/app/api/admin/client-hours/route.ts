import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const email = new URL(req.url).searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'Falta email' }, { status: 400 })

  const admin = createAdminClient()

  const { data: portalClient } = await admin
    .from('portal_clients')
    .select('plan_horas_mensual, nombre, nombre_plan')
    .eq('email', email)
    .maybeSingle()

  if (!portalClient) return NextResponse.json({ data: null })

  const plan = portalClient.plan_horas_mensual || 0
  if (plan === 0) return NextResponse.json({ data: { plan: 0, nombre: portalClient.nombre, nombre_plan: portalClient.nombre_plan, horas_consumidas: 0, horas_restantes: 0, porcentaje: 0 } })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  const [{ data: resolved }, { data: open }] = await Promise.all([
    admin.from('tickets').select('horas_reales').eq('client_email', email).in('estado', ['resuelto', 'cerrado']).gte('resolved_at', monthStart).lt('resolved_at', monthEnd).is('deleted_at', null),
    admin.from('tickets').select('horas_estimadas, horas_reales').eq('client_email', email).not('estado', 'in', '("resuelto","cerrado")').eq('horas_aprobadas', true).gte('created_at', monthStart).lt('created_at', monthEnd).is('deleted_at', null),
  ])

  const horas_consumidas = (resolved ?? []).reduce((s, t) => s + (Number(t.horas_reales) || 0), 0)
                         + (open    ?? []).reduce((s, t) => s + (Number(t.horas_reales ?? t.horas_estimadas) || 0), 0)

  return NextResponse.json({
    data: {
      nombre:          portalClient.nombre,
      nombre_plan:     portalClient.nombre_plan,
      plan,
      horas_consumidas,
      horas_restantes: Math.max(0, plan - horas_consumidas),
      porcentaje:      Math.round((horas_consumidas / plan) * 100),
    },
  })
}
