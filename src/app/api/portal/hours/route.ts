import { NextRequest, NextResponse } from 'next/server'
import { getPortalClient, PORTAL_COOKIE } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { buildHorasAlertaHtml } from '@/lib/ticket-emails'

function horasTicketAbierto(t: { horas_estimadas: number | string | null; horas_reales: number | string | null; horas_aprobadas: boolean | null }): number {
  if (t.horas_reales != null) return Number(t.horas_reales) || 0
  if (t.horas_aprobadas) return Number(t.horas_estimadas) || 0
  return 0
}

// Returns the billing period [start, end) for a client whose plan renews on
// `dia` of each month. If today is before `dia`, the period started last month.
function billingPeriod(dia: number, offset = 0): { start: string; end: string; label: string } {
  const now = new Date()
  let startYear  = now.getFullYear()
  let startMonth = now.getMonth()
  if (now.getDate() < dia) startMonth -= 1
  startMonth += offset
  while (startMonth < 0)  { startMonth += 12; startYear -= 1 }
  while (startMonth > 11) { startMonth -= 12; startYear += 1 }
  const start = new Date(startYear, startMonth, dia)
  const end   = new Date(startYear, startMonth + 1, dia)
  return {
    start: start.toISOString(),
    end:   end.toISOString(),
    label: start.toLocaleString('es-AR', { month: 'long', year: 'numeric' }),
  }
}

async function queryPeriodHoras(
  admin: ReturnType<typeof createAdminClient>,
  clientEmail: string,
  start: string,
  end: string,
) {
  const [{ data: resolved }, { data: open }] = await Promise.all([
    admin.from('tickets').select('horas_reales').eq('client_email', clientEmail).in('estado', ['resuelto', 'cerrado']).or(`and(resolved_at.gte.${start},resolved_at.lt.${end}),and(resolved_at.is.null,created_at.gte.${start},created_at.lt.${end})`).is('deleted_at', null),
    admin.from('tickets').select('horas_estimadas, horas_reales, horas_aprobadas').eq('client_email', clientEmail).not('estado', 'in', '("resuelto","cerrado")').not('horas_estimadas', 'is', null).gte('created_at', start).lt('created_at', end).is('deleted_at', null),
  ])
  return (resolved ?? []).reduce((s, t) => s + (Number(t.horas_reales) || 0), 0)
       + (open ?? []).reduce((s, t) => s + horasTicketAbierto(t), 0)
}

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get(PORTAL_COOKIE)?.value
  if (!sessionId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const client = await getPortalClient(sessionId)
  if (!client) return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 })

  const admin = createAdminClient()

  // Fetch dia_renovacion for this client
  const { data: clientRow } = await admin.from('portal_clients')
    .select('id, nombre, alerta_80_enviada_mes, dia_renovacion')
    .eq('email', client.email).maybeSingle()
  const dia = (clientRow as { dia_renovacion?: number } | null)?.dia_renovacion ?? 1

  const { start: periodStart, end: periodEnd, label: mesLabel } = billingPeriod(dia)

  const [{ data: resolvedTickets }, { data: openTickets }] = await Promise.all([
    admin.from('tickets').select('id, numero, titulo, horas_estimadas, horas_reales, resolved_at, estado').eq('client_email', client.email).in('estado', ['resuelto', 'cerrado']).or(`and(resolved_at.gte.${periodStart},resolved_at.lt.${periodEnd}),and(resolved_at.is.null,created_at.gte.${periodStart},created_at.lt.${periodEnd})`).is('deleted_at', null).order('resolved_at', { ascending: false }),
    admin.from('tickets').select('id, numero, titulo, horas_estimadas, horas_reales, horas_aprobadas, estado').eq('client_email', client.email).not('estado', 'in', '("resuelto","cerrado")').not('horas_estimadas', 'is', null).gte('created_at', periodStart).lt('created_at', periodEnd).is('deleted_at', null).order('created_at', { ascending: false }),
  ])

  const horasResueltas  = (resolvedTickets ?? []).reduce((s, t) => s + (Number(t.horas_reales) || 0), 0)
  const horasAbiertas   = (openTickets    ?? []).reduce((s, t) => s + horasTicketAbierto(t), 0)
  const horasConsumidas = horasResueltas + horasAbiertas

  const plan = client.plan_horas_mensual || 0
  const now  = new Date()
  const mesStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const porcentaje = plan > 0 ? Math.min(100, Math.round((horasConsumidas / plan) * 100)) : 0

  // 80% warning — send once per billing period
  if (plan > 0 && porcentaje >= 80 && clientRow) {
    if ((clientRow as { alerta_80_enviada_mes?: string | null }).alerta_80_enviada_mes !== mesStr) {
      void Promise.resolve(admin.from('portal_clients').update({ alerta_80_enviada_mes: mesStr } as Record<string, unknown>).eq('id', clientRow.id))
      sendGmail({
        from:    'info@globalalora.com',
        to:      client.email,
        subject: `Alerta: usaste el ${porcentaje}% de tus horas de ${mesLabel}`,
        html:    buildHorasAlertaHtml({ client_nombre: client.nombre, porcentaje, horas_consumidas: horasConsumidas, plan, mes: mesLabel }),
      }).catch(() => {})
    }
  }

  // Format period dates for display, e.g. "6 ago – 6 sep 2026"
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  const periodoLabel = `${fmtDate(periodStart)} – ${fmtDate(periodEnd)} ${new Date(periodEnd).getFullYear()}`

  // History: previous 2 billing periods
  const historial = await Promise.all([-2, -1].map(async (offset) => {
    const { start, end } = billingPeriod(dia, offset)
    const consumidas = await queryPeriodHoras(admin, client.email, start, end)
    const periodoH = `${fmtDate(start)} – ${fmtDate(end)} ${new Date(end).getFullYear()}`
    return { mes: periodoH, horas_consumidas: consumidas, plan_horas_mensual: plan, porcentaje: plan > 0 ? Math.min(100, Math.round((consumidas / plan) * 100)) : 0 }
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
      mes:                periodoLabel,
      historial,
    },
  })
}
