import { sendGmail } from '@/lib/google-gmail'

const ALERT_TO = 'somosglobalalora@gmail.com'

interface NewLeadAlertInput {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  empresa: string | null
  pais: string | null
  fuente: string | null
  mensaje: string | null
}

/**
 * Notifies the team by email whenever a new lead is created from a web
 * form (via /api/embed/submit). Best-effort: never throws, so a failure
 * here can't block lead creation — just gets logged.
 */
export async function sendNewLeadAlert(lead: NewLeadAlertInput): Promise<void> {
  try {
    const crmUrl = `https://alora-crm.vercel.app/leads/${lead.id}`
    await sendGmail({
      from: 'info@globalalora.com',
      to: ALERT_TO,
      subject: `🆕 Nuevo lead: ${lead.nombre}${lead.empresa ? ` (${lead.empresa})` : ''}`,
      html: `
        <p>Entró un lead nuevo desde el sitio web.</p>
        <ul>
          <li><strong>Nombre:</strong> ${lead.nombre}</li>
          ${lead.empresa ? `<li><strong>Empresa:</strong> ${lead.empresa}</li>` : ''}
          ${lead.email ? `<li><strong>Email:</strong> ${lead.email}</li>` : ''}
          ${lead.telefono ? `<li><strong>Teléfono:</strong> ${lead.telefono}</li>` : ''}
          ${lead.pais ? `<li><strong>País:</strong> ${lead.pais}</li>` : ''}
          ${lead.fuente ? `<li><strong>Fuente:</strong> ${lead.fuente}</li>` : ''}
          ${lead.mensaje ? `<li><strong>Mensaje:</strong> ${lead.mensaje}</li>` : ''}
        </ul>
        <p><a href="${crmUrl}">Ver en el CRM →</a></p>
      `,
    })
  } catch (err) {
    console.error('[leads] Failed to send new lead alert email:', err instanceof Error ? err.message : err)
  }
}
