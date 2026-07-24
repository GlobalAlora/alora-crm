import type { TicketAttachment } from '@/types'

export const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ticket.globalalora.com'

const PRIO_LABEL: Record<string, string> = { baja: 'Baja', media: 'Normal', alta: 'Alta', urgente: 'URGENTE' }
const PRIO_COLOR: Record<string, string> = { urgente: '#ef4444', alta: '#f97316' }

const FOOTER = `<p style="font-size:13px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:16px;margin:24px 0 0">
  Alora Digital · <a href="https://globalalora.com" style="color:#3b82f6">globalalora.com</a>
</p>`

const HEADER = (title: string, sub?: string) => `
<div style="background:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0">
  <h2 style="color:#fff;margin:0;font-size:18px">${title}</h2>
  ${sub ? `<p style="color:#94a3b8;margin:4px 0 0;font-size:13px">${sub}</p>` : ''}
</div>`

function wrap(header: string, body: string) {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  ${header}
  <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
    ${body}
    ${FOOTER}
  </div>
</div>`
}

// ─── Team notification (new ticket) ────────────────────────

export function buildTeamNotifHtml(ticket: {
  numero: string; titulo: string; descripcion: string | null
  client_nombre: string; client_email: string
  client_empresa?: string | null; client_telefono?: string | null
  prioridad: string; attachments?: TicketAttachment[]
  trackingUrl: string
}) {
  const attachHtml = (ticket.attachments ?? []).length > 0
    ? `<div style="margin-top:16px">
       <p style="font-size:12px;color:#64748b;margin:0 0 8px">Archivos adjuntos (${ticket.attachments!.length}):</p>
       ${ticket.attachments!.map(a => `<a href="${a.url}" style="display:inline-block;margin:2px 4px 2px 0;padding:4px 10px;background:#f1f5f9;border-radius:6px;font-size:12px;color:#3b82f6;text-decoration:none">${a.name}</a>`).join('')}
       </div>`
    : ''

  const body = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px;width:110px">Cliente</td><td style="font-size:13px;font-weight:600">${ticket.client_nombre}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Email</td><td style="font-size:13px">${ticket.client_email}</td></tr>
      ${ticket.client_empresa ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Empresa</td><td style="font-size:13px">${ticket.client_empresa}</td></tr>` : ''}
      ${ticket.client_telefono ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Teléfono</td><td style="font-size:13px">${ticket.client_telefono}</td></tr>` : ''}
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Urgencia</td>
          <td style="font-size:13px;font-weight:600;color:${PRIO_COLOR[ticket.prioridad] ?? '#3b82f6'}">${PRIO_LABEL[ticket.prioridad] ?? ticket.prioridad}</td></tr>
    </table>
    <h3 style="font-size:15px;color:#1e293b;margin:0 0 8px">${ticket.titulo}</h3>
    ${ticket.descripcion ? `<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">${ticket.descripcion.replace(/\n/g, '<br>')}</p>` : ''}
    ${attachHtml}
    <div style="margin-top:24px">
      <a href="${ticket.trackingUrl}" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
        Ver en portal del cliente
      </a>
    </div>`

  return wrap(HEADER('Nuevo ticket recibido', ticket.numero), body)
}

// ─── Client confirmation (ticket created) ──────────────────

export function buildClientConfirmHtml(ticket: {
  numero: string; titulo: string; client_nombre: string; trackingUrl: string
}) {
  const body = `
    <p style="font-size:15px;color:#1e293b">Hola <strong>${ticket.client_nombre}</strong>,</p>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      Recibimos tu solicitud de soporte. Nuestro equipo la va a revisar y te responderemos a la brevedad.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0">
      <p style="margin:0 0 4px;color:#64748b;font-size:12px">Tu número de ticket</p>
      <p style="margin:0;font-size:22px;font-weight:700;color:#1e293b;font-family:monospace">${ticket.numero}</p>
    </div>
    <p style="font-size:14px;color:#475569">Podés seguir el estado de tu ticket haciendo click acá:</p>
    <a href="${ticket.trackingUrl}" style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;margin-bottom:24px">
      Seguir mi ticket →
    </a>`

  return wrap(HEADER('Alora — Centro de Soporte'), body)
}

// ─── Client reply notification (team responded) ────────────

export function buildTeamReplyHtml(ticket: {
  numero: string; titulo: string; client_nombre: string | null
  commentText: string; trackingUrl: string
}) {
  const body = `
    <p style="font-size:15px;color:#1e293b">Hola${ticket.client_nombre ? ` <strong>${ticket.client_nombre}</strong>` : ''},</p>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      Nuestro equipo respondió a tu ticket <strong>${ticket.numero}</strong>.
    </p>
    <div style="background:#f8fafc;border-left:3px solid #3b82f6;border-radius:4px;padding:14px 18px;margin:20px 0">
      <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;white-space:pre-wrap">${ticket.commentText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    </div>
    <a href="${ticket.trackingUrl}" style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
      Ver conversación completa →
    </a>`

  return wrap(HEADER('Alora — Centro de Soporte'), body)
}
