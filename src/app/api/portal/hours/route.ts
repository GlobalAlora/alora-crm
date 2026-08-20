import { NextRequest, NextResponse } from 'next/server'
import { getPortalClient, PORTAL_COOKIE } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { buildHorasAlertaHtml } from '@/lib/ticket-emails'

// Un ticket abierto solo consume horas del plan si ya se trabajó (horas_reales)
// o si el cliente aprobó la estimación (horas_aprobadas). Mientras esté
// pendiente de aprobación, no debe contar contra el plan.
function horasTicketAbierto(t: { horas_estimadas: number | string | null; horas_reales: number | string | null; horas_aprobadas: boolean | null }): number {
  if (t.horas_reales != null) return Number(t.horas_reales) || 0
  if (t.horas_aprobadas) return Number(t.horas_estimadas) || 0
  return 0
}

async function queryMonthHoras(
  admin: ReturnType<typeof createAdminClient>,
  clientEmail: string,
  monthStart: string,
  monthEnd: string,
) {
  const [{ data: resolved }, { data: open }] = await Promise.all([
    admin.from('tickets').select('horas_reales').eq('client_email', clientEmail).in('estado', ['resuelto', 'cerrado']).gte('resolved_at', monthStart).lt('resolved_at', monthEnd).is('deleted_at', null),
    admin.from('tickets').select('horas_estimadas, horas_reales, horas_aprobadas').eq('client_email', clientEmail).not('estado', 'in', '("resuelto","cerrado")').not('horas_estimadas', 'is', null).gte('created_at', monthStart).lt('created_at', monthEnd).is('deleted_at', null),
  ])
  const consumidas = (resolved ?? []).reduce((s, t) => s + (Number(t.horas_reales) || 0), 0) + (open ?? []).reduce((s, t) => s + horasTicketAbierto(t), 0)
  return consumidas
}

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get(PORTAL_COOKIE)?.value
  if (!sessionId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const client = await getPortalClient(sessionId)
  if (!client) return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  const admin = createAdminClient()

  const [{ data: resolvedTickets }, { data: openTickets }] = await Promise.all([
    admin.from('tickets').select('id, numero, titulo, horas_estimadas, horas_reales, resolved_at, estado').eq('client_email', client.email).in('estado', ['resuelto', 'cerrado']).gte('resolved_at', monthStart).lt('resolved_at', monthEnd).is('deleted_at', null).order('resolved_at', { ascending: false }),
    admin.from('tickets').select('id, numero, titulo, horas_estimadas, horas_reales, horas_aprobadas, estado').eq('client_email', client.email).not('estado', 'in', '("resuelto","cerrado")').not('horas_estimadas', 'is', null).gte('created_at', monthStart).lt('created_at', monthEnd).is('deleted_at', null).order('created_at', { ascending: false }),
  ])

  const horasResueltas  = (resolvedTickets ?? []).reduce((s, t) => s + (Number(t.horas_reales) || 0), 0)
  const horasAbiertas   = (openTickets    ?? []).reduce((s, t) => s + horasTicketAbierto(t), 0)
  const horasConsumidas = horasResueltas + horasAbiertas

  const plan     = client.plan_horas_mensual || 0
  const mesStr   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const mesLabel = now.toLocaleString('es-AR', { month: 'long', year: 'numeric' })
  const porcentaje = plan > 0 ? Math.min(100, Math.round((horasConsumidas / plan) * 100)) : 0

  // 80% warning — send once per month
  if (plan > 0 && porcentaje >= 80) {
    const { data: clientRow } = await admin.from('portal_clients').select('id, nombre, alerta_80_enviada_mes').eq('email', client.email).maybeSingle()
    if (clientRow && (clientRow as { alerta_80_enviada_mes?: string | null }).alerta_80_enviada_mes !== mesStr) {
      void Promise.resolve(admin.from('portal_clients').update({ alerta_80_enviada_mes: mesStr } as Record<string, unknown>).eq('id', clientRow.id))
      sendGmail({
        from:    'info@globalalora.com',
        to:      client.email,
        subject: `Alerta: usaste el ${porcentaje}% de tus horas de ${mesLabel}`,
        html:    buildHorasAlertaHtml({ client_nombre: client.nombre, porcentaje, horas_consumidas: horasConsumidas, plan, mes: mesLabel }),
      }).catch(() => {})
    }
  }

  // History: previous 2 months
  const historial = await Promise.all([-2, -1].map(async (offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString()
    const label = d.toLocaleString('es-AR', { month: 'long', year: 'numeric' })
    const consumidas = await queryMonthHoras(admin, client.email, start, end)
    return { mes: label, horas_consumidas: consumidas, plan_horas_mensual: plan, porcentaje: plan > 0 ? Math.min(100, Math.round((consumidas / plan) * 100)) : 0 }
  }))

  return NextResponse.json({
    data: {
      plan_horas_mensual: plan,
      horas_consumidas:   horasConsumidas,
      horas_restantes:    Math.max(0, plan - horasConsumidas),
      horas_extra:        Math.max(0, horasConsumidas - plan),
      porcentaje,
      tickets_resueltos:  resolvedTickets ?? [],
      tickets_abiertos:   openTickets ?? [],
      mes:                mesLabel,
      historial,
    },
  })
}
