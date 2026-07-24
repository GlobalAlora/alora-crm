import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { createLinkedTask } from '@/lib/ticket-task'
import type { TicketPrioridad } from '@/types'

const INTERNAL_EMAIL = 'somosglobalalora@gmail.com'
const PORTAL_URL     = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'https://ticket.globalalora.com'

function buildTeamNotifHtml(ticket: {
  numero: string; titulo: string; descripcion: string | null
  client_nombre: string; client_email: string; client_empresa?: string | null
  client_telefono?: string | null; prioridad: string
  attachments?: { url: string; name: string; type: string }[]
  trackingUrl: string
}) {
  const prioLabel: Record<string, string> = { baja: 'Baja', media: 'Normal', alta: 'Alta', urgente: 'URGENTE' }
  const attachHtml = (ticket.attachments ?? []).length > 0
    ? `<div style="margin-top:16px"><p style="font-size:12px;color:#64748b;margin:0 0 8px">Archivos adjuntos (${ticket.attachments!.length}):</p>
       ${ticket.attachments!.map(a => `<a href="${a.url}" style="display:inline-block;margin:2px 4px 2px 0;padding:4px 10px;background:#f1f5f9;border-radius:6px;font-size:12px;color:#3b82f6;text-decoration:none">${a.name}</a>`).join('')}</div>`
    : ''
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#0f172a;padding:24px 32px;border-radius:12px 12px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">Nuevo ticket recibido</h2>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px">${ticket.numero}</p>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px;width:110px">Cliente</td><td style="font-size:13px;font-weight:600">${ticket.client_nombre}</td></tr>
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Email</td><td style="font-size:13px">${ticket.client_email}</td></tr>
      ${ticket.client_empresa ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Empresa</td><td style="font-size:13px">${ticket.client_empresa}</td></tr>` : ''}
      ${ticket.client_telefono ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Teléfono</td><td style="font-size:13px">${ticket.client_telefono}</td></tr>` : ''}
      <tr><td style="padding:5px 0;color:#64748b;font-size:13px">Urgencia</td><td style="font-size:13px;font-weight:600;color:${ticket.prioridad === 'urgente' ? '#ef4444' : ticket.prioridad === 'alta' ? '#f97316' : '#3b82f6'}">${prioLabel[ticket.prioridad] ?? ticket.prioridad}</td></tr>
    </table>
    <h3 style="font-size:15px;color:#1e293b;margin:0 0 8px">${ticket.titulo}</h3>
    ${ticket.descripcion ? `<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px">${ticket.descripcion.replace(/\n/g, '<br>')}</p>` : ''}
    ${attachHtml}
    <div style="margin-top:24px">
      <a href="${ticket.trackingUrl}" style="display:inline-block;padding:10px 20px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
        Ver en portal del cliente
      </a>
    </div>
  </div>
</div>`
}

function buildClientConfirmHtml(ticket: {
  numero: string; titulo: string; client_nombre: string; trackingUrl: string
}) {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">Alora — Centro de Soporte</h2>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
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
    </a>

    <p style="font-size:13px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:16px;margin:0">
      Alora Digital · <a href="https://globalalora.com" style="color:#3b82f6">globalalora.com</a>
    </p>
  </div>
</div>`
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    client_nombre: string
    client_email: string
    client_empresa?: string
    client_telefono?: string
    titulo: string
    descripcion?: string
    prioridad?: TicketPrioridad
    attachments?: { url: string; name: string; type: string }[]
  }

  if (!body.client_nombre?.trim() || !body.client_email?.trim() || !body.titulo?.trim()) {
    return NextResponse.json({ error: 'Nombre, email y título son requeridos' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(body.client_email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Auto-number TICK-YYYY-NNN
  const year = new Date().getFullYear()
  const { count } = await admin
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .like('numero', `TICK-${year}-%`)
  const seq    = (count ?? 0) + 1
  const numero = `TICK-${year}-${String(seq).padStart(3, '0')}`

  // Auto-match empresa → project (case-insensitive)
  let autoProjectId: string | null = null
  if (body.client_empresa?.trim()) {
    const { data: matchedProject } = await admin
      .from('projects')
      .select('id')
      .ilike('nombre', body.client_empresa.trim())
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    autoProjectId = matchedProject?.id ?? null
  }

  const { data: ticket, error } = await admin
    .from('tickets')
    .insert({
      numero,
      titulo:          body.titulo.trim(),
      descripcion:     body.descripcion?.trim() ?? null,
      prioridad:       body.prioridad ?? 'media',
      categoria:       'soporte',
      client_nombre:   body.client_nombre.trim(),
      client_email:    body.client_email.trim().toLowerCase(),
      client_empresa:  body.client_empresa?.trim() ?? null,
      client_telefono: body.client_telefono?.trim() ?? null,
      attachments:     body.attachments ?? [],
      ...(autoProjectId ? { project_id: autoProjectId } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-create task if project was matched
  if (autoProjectId) {
    createLinkedTask({
      id:          ticket.id,
      numero,
      titulo:      body.titulo.trim(),
      prioridad:   body.prioridad ?? 'media',
      project_id:  autoProjectId,
      attachments: body.attachments ?? [],
    }, admin).catch(() => {})
  }

  const trackingUrl = `${PORTAL_URL}/${ticket.ticket_token}`

  // Fire-and-forget emails
  Promise.all([
    sendGmail({
      from:    'info@globalalora.com',
      to:      INTERNAL_EMAIL,
      subject: `[${numero}] Nuevo ticket: ${body.titulo.trim()}`,
      html:    buildTeamNotifHtml({
        numero, titulo: body.titulo.trim(), descripcion: body.descripcion?.trim() ?? null,
        client_nombre: body.client_nombre.trim(), client_email: body.client_email.trim(),
        client_empresa: body.client_empresa ?? null, client_telefono: body.client_telefono ?? null,
        prioridad: body.prioridad ?? 'media', attachments: body.attachments ?? [], trackingUrl,
      }),
    }),
    sendGmail({
      from:    'info@globalalora.com',
      to:      body.client_email.trim(),
      subject: `Tu solicitud fue recibida — ${numero}`,
      html:    buildClientConfirmHtml({
        numero, titulo: body.titulo.trim(),
        client_nombre: body.client_nombre.trim(), trackingUrl,
      }),
    }),
  ]).catch(() => { /* emails are best-effort */ })

  return NextResponse.json({ data: { numero, token: ticket.ticket_token, trackingUrl } }, { status: 201 })
}
