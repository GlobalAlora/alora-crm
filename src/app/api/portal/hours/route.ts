import { NextRequest, NextResponse } from 'next/server'
import { getPortalClient, PORTAL_COOKIE } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get(PORTAL_COOKIE)?.value
  if (!sessionId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const client = await getPortalClient(sessionId)
  if (!client) return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString() // exclusive: first of next month

  const admin = createAdminClient()

  // Resolved this month: count horas_reales (actual work done)
  const [{ data: resolvedTickets }, { data: openTickets }] = await Promise.all([
    admin
      .from('tickets')
      .select('id, numero, titulo, horas_estimadas, horas_reales, resolved_at, estado')
      .eq('client_email', client.email)
      .in('estado', ['resuelto', 'cerrado'])
      .gte('resolved_at', monthStart)
      .lt('resolved_at', monthEnd)
      .is('deleted_at', null)
      .order('resolved_at', { ascending: false }),
    // Open tickets this month with approved hours
    admin
      .from('tickets')
      .select('id, numero, titulo, horas_estimadas, estado')
      .eq('client_email', client.email)
      .not('estado', 'in', '("resuelto","cerrado")')
      .eq('horas_aprobadas', true)
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  const horasResueltas = (resolvedTickets ?? []).reduce((sum, t) => sum + (Number(t.horas_reales) || 0), 0)
  const horasAbiertas  = (openTickets    ?? []).reduce((sum, t) => sum + (Number(t.horas_estimadas) || 0), 0)
  const horasConsumidas = horasResueltas + horasAbiertas

  const plan = client.plan_horas_mensual || 0
  const mesLabel = now.toLocaleString('es-AR', { month: 'long', year: 'numeric' })

  return NextResponse.json({
    data: {
      plan_horas_mensual: plan,
      horas_consumidas:   horasConsumidas,
      horas_restantes:    Math.max(0, plan - horasConsumidas),
      porcentaje:         plan > 0 ? Math.min(100, Math.round((horasConsumidas / plan) * 100)) : 0,
      tickets_resueltos:  resolvedTickets ?? [],
      tickets_abiertos:   openTickets ?? [],
      mes:                mesLabel,
    },
  })
}
