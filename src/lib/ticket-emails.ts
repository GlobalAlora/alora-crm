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

// ─── Followup reminder (2-day inactivity) ──────────────────

export function buildFollowupReminderHtml(ticket: {
  numero: string; titulo: string; client_nombre: string | null; trackingUrl: string
}) {
  const body = `
    <p style="font-size:15px;color:#1e293b">Hola${ticket.client_nombre ? ` <strong>${ticket.client_nombre}</strong>` : ''},</p>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      Quedamos esperando tu respuesta en el ticket <strong>${ticket.numero}</strong>.
      ¿Pudiste ver nuestra última respuesta?
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0">
      <p style="margin:0 0 4px;color:#64748b;font-size:12px">Ticket</p>
      <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b">${ticket.titulo}</p>
    </div>
    <a href="${ticket.trackingUrl}" style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
      Ver ticket y responder →
    </a>
    <p style="font-size:13px;color:#94a3b8;margin-top:20px">
      Si ya no necesitás soporte en este tema, podés ignorar este mensaje y el ticket se cerrará automáticamente.
    </p>`

  return wrap(HEADER('Alora — Seguimiento de ticket', ticket.numero), body)
}

// ─── Ticket closed by inactivity ───────────────────────────

export function buildTicketClosedInactivityHtml(ticket: {
  numero: string; titulo: string; client_nombre: string | null; trackingUrl: string
}) {
  const body = `
    <p style="font-size:15px;color:#1e293b">Hola${ticket.client_nombre ? ` <strong>${ticket.client_nombre}</strong>` : ''},</p>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      El ticket <strong>${ticket.numero}</strong> fue cerrado automáticamente por no recibir respuesta en 5 días.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0">
      <p style="margin:0 0 4px;color:#64748b;font-size:12px">Ticket cerrado</p>
      <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b">${ticket.titulo}</p>
    </div>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      Si todavía necesitás ayuda, podés abrir un nuevo ticket y lo atenderemos.
    </p>
    <a href="${ticket.trackingUrl}" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
      Ver ticket →
    </a>`

  return wrap(HEADER('Alora — Ticket cerrado', ticket.numero), body)
}

// ─── Status change notification ────────────────────────────

const ESTADO_LABELS: Record<string, string> = {
  en_progreso: 'En progreso',
  en_espera:   'En espera',
  resuelto:    'Resuelto',
  cerrado:     'Cerrado',
}
const ESTADO_COLOR: Record<string, string> = {
  en_progreso: '#f59e0b',
  en_espera:   '#f97316',
  resuelto:    '#22c55e',
  cerrado:     '#94a3b8',
}
const ESTADO_MSG: Record<string, string> = {
  en_progreso: 'Nuestro equipo ya está trabajando en tu solicitud.',
  en_espera:   'Quedamos esperando información adicional de tu parte. Por favor revisá los comentarios del ticket.',
  resuelto:    'Tu solicitud fue resuelta. Si tenés alguna duda o el problema persiste, podés reabrir el ticket respondiendo en la conversación.',
  cerrado:     'Tu ticket fue cerrado.',
}

export function buildStatusChangeHtml(ticket: {
  numero: string; titulo: string; client_nombre: string | null
  nuevo_estado: string; trackingUrl: string
}) {
  const label   = ESTADO_LABELS[ticket.nuevo_estado] ?? ticket.nuevo_estado
  const color   = ESTADO_COLOR[ticket.nuevo_estado]  ?? '#3b82f6'
  const mensaje = ESTADO_MSG[ticket.nuevo_estado]    ?? ''

  const body = `
    <p style="font-size:15px;color:#1e293b">Hola${ticket.client_nombre ? ` <strong>${ticket.client_nombre}</strong>` : ''},</p>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      El estado de tu ticket <strong>${ticket.numero}</strong> fue actualizado.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin:20px 0">
      <p style="margin:0 0 8px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Ticket</p>
      <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1e293b">${ticket.titulo}</p>
      <span style="display:inline-block;padding:4px 14px;border-radius:99px;background:${color}20;color:${color};font-size:13px;font-weight:700">${label}</span>
    </div>
    ${mensaje ? `<p style="font-size:14px;color:#475569;line-height:1.6">${mensaje}</p>` : ''}
    <a href="${ticket.trackingUrl}" style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
      Ver ticket →
    </a>`

  return wrap(HEADER(`Alora — Ticket ${label.toLowerCase()}`, ticket.numero), body)
}

// ─── Hours estimated (admin set hours, client must approve) ──

export function buildHorasEstimadasHtml(ticket: {
  numero: string; titulo: string; client_nombre: string | null
  horas_estimadas: number; trackingUrl: string
}) {
  const body = `
    <p style="font-size:15px;color:#1e293b">Hola${ticket.client_nombre ? ` <strong>${ticket.client_nombre}</strong>` : ''},</p>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      Estimamos el tiempo necesario para resolver tu solicitud <strong>${ticket.numero}</strong>.
    </p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:20px;margin:20px 0;text-align:center">
      <p style="margin:0 0 4px;color:#92400e;font-size:13px;text-transform:uppercase;letter-spacing:.05em;font-weight:700">Horas estimadas</p>
      <p style="margin:0;font-size:36px;font-weight:800;color:#1e293b">${ticket.horas_estimadas} hs</p>
      <p style="margin:8px 0 0;font-size:13px;color:#78350f">${ticket.titulo}</p>
    </div>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      Para que estas horas se descuenten de tu plan mensual necesitamos tu aprobación. Ingresá al portal y hacé click en "Aprobar".
    </p>
    <a href="${ticket.trackingUrl}" style="display:inline-block;padding:10px 20px;background:#d97706;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
      Aprobar horas →
    </a>`

  return wrap(HEADER('Alora — Estimación de horas', ticket.numero), body)
}

// ─── Hours approved (client approved, notify admin) ──────────

export function buildHorasAprobadasAdminHtml(ticket: {
  numero: string; titulo: string; client_nombre: string | null
  client_email: string | null; horas_estimadas: number
}) {
  const body = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px;width:110px">Cliente</td><td style="font-size:13px;font-weight:600">${ticket.client_nombre ?? '—'}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Email</td><td style="font-size:13px">${ticket.client_email ?? '—'}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Ticket</td><td style="font-size:13px;font-family:monospace">${ticket.numero}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Horas</td><td style="font-size:14px;font-weight:700;color:#16a34a">${ticket.horas_estimadas} hs aprobadas ✓</td></tr>
    </table>
    <p style="font-size:14px;color:#475569">${ticket.titulo}</p>`

  return wrap(HEADER('Cliente aprobó las horas estimadas', ticket.numero), body)
}

// ─── CSAT email (after ticket resolved) ──────────────────────

export function buildCsatEmailHtml(ticket: {
  numero: string; titulo: string; client_nombre: string | null
  thumbsUpUrl: string; thumbsDownUrl: string
}) {
  const body = `
    <p style="font-size:15px;color:#1e293b">Hola${ticket.client_nombre ? ` <strong>${ticket.client_nombre}</strong>` : ''},</p>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      Tu ticket <strong>${ticket.numero}</strong> fue marcado como resuelto. ¿Cómo calificás la atención que recibiste?
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin:20px 0">
      <p style="margin:0 0 4px;color:#64748b;font-size:12px">Ticket</p>
      <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#1e293b">${ticket.titulo}</p>
      <div style="display:flex;gap:12px;justify-content:center">
        <a href="${ticket.thumbsUpUrl}" style="display:inline-block;padding:12px 28px;background:#22c55e;color:#fff;border-radius:10px;text-decoration:none;font-size:24px;line-height:1">👍</a>
        <a href="${ticket.thumbsDownUrl}" style="display:inline-block;padding:12px 28px;background:#ef4444;color:#fff;border-radius:10px;text-decoration:none;font-size:24px;line-height:1">👎</a>
      </div>
    </div>
    <p style="font-size:13px;color:#94a3b8">Tu opinión nos ayuda a mejorar el servicio.</p>`
  return wrap(HEADER('Alora — ¿Cómo fue tu experiencia?', ticket.numero), body)
}

// ─── 80% hours warning ────────────────────────────────────────

export function buildHorasAlertaHtml(data: {
  client_nombre: string | null; porcentaje: number
  horas_consumidas: number; plan: number; mes: string
}) {
  const restantes = Math.max(0, data.plan - data.horas_consumidas)
  const body = `
    <p style="font-size:15px;color:#1e293b">Hola${data.client_nombre ? ` <strong>${data.client_nombre}</strong>` : ''},</p>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      Utilizaste el <strong>${data.porcentaje}%</strong> de tu bolsa de horas de ${data.mes}.
    </p>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:20px;margin:20px 0;text-align:center">
      <p style="margin:0 0 6px;color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em">${data.porcentaje}% utilizado</p>
      <p style="margin:0;font-size:32px;font-weight:800;color:#1e293b">${data.horas_consumidas % 1 === 0 ? data.horas_consumidas : data.horas_consumidas.toFixed(1)} <span style="font-size:16px;color:#94a3b8">/ ${data.plan} hs</span></p>
    </div>
    <p style="font-size:14px;color:#475569;line-height:1.6">
      Te quedan <strong>${restantes % 1 === 0 ? restantes : restantes.toFixed(1)} horas</strong> disponibles este mes. Si necesitás ampliar tu plan, contactanos a <a href="mailto:hola@globalalora.com" style="color:#3b82f6">hola@globalalora.com</a>.
    </p>`
  return wrap(HEADER('Alerta — Consumo de horas', data.mes), body)
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
