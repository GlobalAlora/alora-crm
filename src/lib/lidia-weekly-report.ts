import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'

type AdminClient = ReturnType<typeof createAdminClient>

const CRM_URL = 'https://crm.globalalora.com'

const FUENTE_LABEL: Record<string, string> = {
  formulario: 'Formulario',
  referido:   'Referido',
  linkedin:   'LinkedIn',
  instagram:  'Instagram',
  whatsapp:   'WhatsApp',
  chatbot:    'Chatbot',
  mail:       'Email',
  otro:       'Otro',
}

function buildReportHtml(stats: {
  leadsWa:           number
  leadsNuevos:       number
  reunionesAgendadas: number
  casosCompartidos:  number
  derivadosHumano:   number
  tasaConversion:    string
  topCasos:          { name: string; count: number }[]
  fuenteBreakdown:   { fuente: string; count: number }[]
  desde:             string
  hasta:             string
}) {
  const {
    leadsWa, leadsNuevos, reunionesAgendadas, casosCompartidos,
    derivadosHumano, tasaConversion, topCasos, fuenteBreakdown, desde, hasta,
  } = stats

  const topCasosHtml = topCasos.length
    ? topCasos.map(c => `<li style="margin:4px 0;font-size:14px;color:#475569">${c.name} — <strong>${c.count}</strong></li>`).join('')
    : '<li style="font-size:14px;color:#94a3b8">Sin coincidencias esta semana</li>'

  const fuenteHtml = fuenteBreakdown.length
    ? fuenteBreakdown.map(f =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f1f5f9">
          <span style="font-size:13px;color:#475569">${FUENTE_LABEL[f.fuente] ?? f.fuente}</span>
          <span style="font-size:13px;font-weight:600;color:#1e293b">${f.count}</span>
        </div>`).join('')
    : '<p style="font-size:13px;color:#94a3b8;margin:0">Sin datos</p>'

  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">📊 Resumen semanal de Lidia</h2>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px">${desde} al ${hasta}</p>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">

    <!-- Métricas principales -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
        <p style="font-size:28px;font-weight:700;color:#6d28d9;margin:0">${leadsWa}</p>
        <p style="font-size:12px;color:#64748b;margin:4px 0 0">Leads atendidos por Lidia</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
        <p style="font-size:28px;font-weight:700;color:#0ea5e9;margin:0">${leadsNuevos}</p>
        <p style="font-size:12px;color:#64748b;margin:4px 0 0">Leads nuevos al pipeline</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
        <p style="font-size:28px;font-weight:700;color:#059669;margin:0">${reunionesAgendadas}</p>
        <p style="font-size:12px;color:#64748b;margin:4px 0 0">Reuniones agendadas</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
        <p style="font-size:28px;font-weight:700;color:#f59e0b;margin:0">${tasaConversion}%</p>
        <p style="font-size:12px;color:#64748b;margin:4px 0 0">Tasa WA → reunión</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
        <p style="font-size:28px;font-weight:700;color:#d97706;margin:0">${casosCompartidos}</p>
        <p style="font-size:12px;color:#64748b;margin:4px 0 0">Casos de éxito mostrados</p>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
        <p style="font-size:28px;font-weight:700;color:#ef4444;margin:0">${derivadosHumano}</p>
        <p style="font-size:12px;color:#64748b;margin:4px 0 0">Derivados a humano</p>
      </div>
    </div>

    <!-- Fuentes de leads -->
    <div style="margin-bottom:24px">
      <p style="font-size:13px;font-weight:600;color:#1e293b;margin:0 0 10px">Leads nuevos por fuente</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px">
        ${fuenteHtml}
      </div>
    </div>

    ${topCasos.length > 0 ? `
    <!-- Casos portfolio -->
    <div style="margin-bottom:24px">
      <p style="font-size:13px;font-weight:600;color:#1e293b;margin:0 0 10px">Casos más mostrados por Lidia</p>
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

  // Leads atendidos por Lidia: conversaciones únicas con mensajes inbound esta semana
  const { data: inboundRows } = await admin
    .from('wa_messages')
    .select('conversation_id')
    .eq('direction', 'inbound')
    .gte('created_at', desdeISO)
  const leadsWa = new Set((inboundRows ?? []).map(r => r.conversation_id)).size

  // Leads nuevos al pipeline esta semana
  const { data: leadsNuevosRows } = await admin
    .from('leads')
    .select('fuente')
    .is('deleted_at', null)
    .gte('fecha_ingreso', desdeISO)
  const leadsNuevos = leadsNuevosRows?.length ?? 0

  // Breakdown por fuente
  const fuenteCount: Record<string, number> = {}
  for (const row of leadsNuevosRows ?? []) {
    const f = row.fuente ?? 'otro'
    fuenteCount[f] = (fuenteCount[f] ?? 0) + 1
  }
  const fuenteBreakdown = Object.entries(fuenteCount)
    .map(([fuente, count]) => ({ fuente, count }))
    .sort((a, b) => b.count - a.count)

  // Reuniones agendadas: leads que pasaron a reunion_reservada esta semana
  const { count: reunionesAgendadas } = await admin
    .from('stage_history')
    .select('id', { count: 'exact', head: true })
    .eq('etapa', 'reunion_reservada')
    .gte('fecha_ingreso', desdeISO)

  // Tasa WA → reunión
  const tasa = leadsWa > 0 ? ((reunionesAgendadas ?? 0) / leadsWa) * 100 : 0
  const tasaConversion = tasa.toFixed(1)

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

  // Usuarios a notificar
  const { data: users } = await admin
    .from('users')
    .select('email')
    .in('role', ['admin', 'sales'])
    .not('email', 'is', null)

  if (!users?.length) return

  const html = buildReportHtml({
    leadsWa,
    leadsNuevos,
    reunionesAgendadas: reunionesAgendadas ?? 0,
    casosCompartidos:   casosCompartidos  ?? 0,
    derivadosHumano:    handoffs          ?? 0,
    tasaConversion,
    topCasos,
    fuenteBreakdown,
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
