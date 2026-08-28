import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function horasTicketAbierto(t: { horas_estimadas: number | string | null; horas_reales: number | string | null; horas_aprobadas: boolean | null }): number {
  if (t.horas_reales != null) return Number(t.horas_reales) || 0
  if (t.horas_aprobadas) return Number(t.horas_estimadas) || 0
  return 0
}

function billingPeriod(dia: number): { start: string; end: string } {
  const now = new Date()
  let startYear  = now.getFullYear()
  let startMonth = now.getMonth()
  if (now.getDate() < dia) startMonth -= 1
  while (startMonth < 0) { startMonth += 12; startYear -= 1 }
  const start = new Date(startYear, startMonth, dia)
  const end   = new Date(startYear, startMonth + 1, dia)
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const email = new URL(req.url).searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'Falta email' }, { status: 400 })

  const admin = createAdminClient()

  const { data: portalClient } = await admin
    .from('portal_clients')
    .select('plan_horas_mensual, nombre, nombre_plan, dia_renovacion')
    .eq('email', email)
    .maybeSingle()

  if (!portalClient) return NextResponse.json({ data: null })

  const plan = portalClient.plan_horas_mensual || 0
  if (plan === 0) return NextResponse.json({ data: { plan: 0, nombre: portalClient.nombre, nombre_plan: portalClient.nombre_plan, horas_consumidas: 0, horas_restantes: 0, porcentaje: 0 } })

  const dia = (portalClient as { dia_renovacion?: number }).dia_renovacion ?? 1
  const { start: periodStart, end: periodEnd } = billingPeriod(dia)

  const [{ data: resolved }, { data: open }] = await Promise.all([
    admin.from('tickets').select('horas_reales').eq('client_email', email).in('estado', ['resuelto', 'cerrado']).or(`and(resolved_at.gte.${periodStart},resolved_at.lt.${periodEnd}),and(resolved_at.is.null,created_at.gte.${periodStart},created_at.lt.${periodEnd})`).is('deleted_at', null),
    admin.from('tickets').select('horas_estimadas, horas_reales, horas_aprobadas').eq('client_email', email).not('estado', 'in', '("resuelto","cerrado")').not('horas_estimadas', 'is', null).gte('created_at', periodStart).lt('created_at', periodEnd).is('deleted_at', null),
  ])

  const horas_consumidas = (resolved ?? []).reduce((s, t) => s + (Number(t.horas_reales) || 0), 0)
                         + (open    ?? []).reduce((s, t) => s + horasTicketAbierto(t), 0)

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
