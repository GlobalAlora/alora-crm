import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'

type AdminClient = ReturnType<typeof createAdminClient>

const CRM_URL = 'https://crm.globalalora.com'

function buildReportHtml(stats: {
  leadsNuevos:      number
  reunionesAgendadas: number
  casosCompartidos: number
  derivadosHumano:  number
  topCasos:         { name: string; count: number }[]
  desde:            string
  hasta:            string
}) {
  const { leadsNuevos, reunionesAgendadas, casosCompartidos, derivadosHumano, topCasos, desde, hasta } = stats

  const topCasosHtml = topCasos.length
    ? topCasos.map(c => `<li style="margin:4px 0;font-size:14px;color:#475569">${c.name} — <strong>${c.count}</strong></li>`).join('')
    : '<li style="font-size:14px;color:#94a3b8">Sin coincidencias esta semana</li>'

  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">📊 Resumen semanal de Lidia</h2>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px">${desde} al ${hasta}</p>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;text-align:center">
        <p style="font-size:32px;font-weight:700;color:#6d28d9;margin:0">${leadsNuevos}</p>
        <p style="font-size:13px;color:#64748b;margin:4px 0 0">Leads atendidos</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;text-align:center">
        <p style="font-size:32px;font-weight:700;color:#059669;margin:0">${reunionesAgendadas}</p>
        <p style="font-size:13px;color:#64748b;margin:4px 0 0">Reuniones agendadas</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;text-align:center">
        <p style="font-size:32px;font-weight:700;color:#d97706;margin:0">${casosCompartidos}</p>
        <p style="font-size:13px;color:#64748b;margin:4px 0 0">Casos de éxito mostrados</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px;text-align:center">
        <p style="font-size:32px;font-weight:700;color:#ef4444;margin:0">${derivadosHumano}</p>
        <p style="font-size:13px;color:#64748b;margin:4px 0 0">Derivados a humano</p>
      </div>
    </div>

    ${topCasos.length > 0 ? `
    <div style="margin-bottom:24px">
      <p style="font-size:13px;font-weight:600;color:#1e293b;margin:0 0 10px">Casos más mostrados</p>
      <ul style="margin:0;padding-left:20px">${topCasosHtml}</ul>
    </div>` : ''}

    <a href="${CRM_URL}/dashboard" style="display:inline-block;background:#6d28d9;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
      Ver dashboard →
    </a>

    <p style="font-size:13px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:16px;margin:24px 0 0">
      Alora Digital · <a href="https://globalalora.com" style="color:#3b82f6">globalalora.com</a>
    </p>
  </div>
</div>`
}

export async function sendLidiaWeeklyReport(admin: AdminClient): Promise<void> {
  const now   = new Date()
  const hasta = new Date(now)
  const desde = new Date(now)
  desde.setDate(desde.getDate() - 7)

  const desdeISO = desde.toISOString()

  const desdeLabel = desde.toLocaleDateString('es-AR', { day: '2-digit', month: 'long' })
  const hastaLabel = hasta.toLocaleDateString('es-AR', { day: '2-digit', month: 'long' })

  // Leads atendidos: conversaciones únicas con al menos un mensaje inbound esta semana
  const { data: inboundRows } = await admin
    .from('wa_messages')
    .select('conversation_id')
    .eq('direction', 'inbound')
    .gte('created_at', desdeISO)
  const leadsNuevos = new Set((inboundRows ?? []).map(r => r.conversation_id)).size

  // Reuniones agendadas: leads que pasaron a reunion_reservada esta semana
  const { count: reunionesAgendadas } = await admin
    .from('stage_history')
    .select('id', { count: 'exact', head: true })
    .eq('etapa', 'reunion_reservada')
    .gte('fecha_ingreso', desdeISO)

  // Casos de éxito compartidos
  const { data: portfolioRows, count: casosCompartidos } = await admin
    .from('activities')
    .select('metadata', { count: 'exact' })
    .like('descripcion', '[portfolio-match]%')
    .gte('created_at', desdeISO)

  // Top casos
  const caseCount: Record<string, number> = {}
  for (const row of portfolioRows ?? []) {
    const name = (row.metadata as { portfolio_case?: string })?.portfolio_case
    if (name) caseCount[name] = (caseCount[name] ?? 0) + 1
  }
  const topCasos = Object.entries(caseCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Derivados a humano
  const { count: handoffs } = await admin
    .from('activities')
    .select('id', { count: 'exact', head: true })
    .like('descripcion', '%pidió hablar con alguien%')
    .gte('created_at', desdeISO)

  // Get all admin/sales users to notify
  const { data: users } = await admin
    .from('users')
    .select('email')
    .in('role', ['admin', 'sales'])
    .not('email', 'is', null)

  if (!users?.length) return

  const html = buildReportHtml({
    leadsNuevos:        leadsNuevos    ?? 0,
    reunionesAgendadas: reunionesAgendadas ?? 0,
    casosCompartidos:   casosCompartidos  ?? 0,
    derivadosHumano:    handoffs          ?? 0,
    topCasos,
    desde: desdeLabel,
    hasta: hastaLabel,
  })

  await Promise.allSettled(
    users.map(u =>
      sendGmail({
        from:    'info@globalalora.com',
        to:      u.email!,
        subject: `📊 Resumen semanal de Lidia — ${desdeLabel} al ${hastaLabel}`,
        html,
      })
    )
  )
}
