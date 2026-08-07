import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { createLinkedTask } from '@/lib/ticket-task'
import { PORTAL_URL, buildTeamNotifHtml, buildClientConfirmHtml } from '@/lib/ticket-emails'
import type { TicketPrioridad, TicketAttachment } from '@/types'

const INTERNAL_EMAIL = 'somosglobalalora@gmail.com'

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    client_nombre: string
    client_email: string
    client_empresa?: string
    client_telefono?: string
    titulo: string
    descripcion?: string
    prioridad?: TicketPrioridad
    categoria?: string
    attachments?: TicketAttachment[]
  }

  if (!body.client_nombre?.trim() || !body.client_email?.trim() || !body.titulo?.trim()) {
    return NextResponse.json({ error: 'Nombre, email y título son requeridos' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(body.client_email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const year  = new Date().getFullYear()

  // Run ticket count and project match in parallel
  const [{ count }, { data: matchedProject }] = await Promise.all([
    admin.from('tickets').select('*', { count: 'exact', head: true }).like('numero', `TICK-${year}-%`),
    body.client_empresa?.trim()
      ? admin.from('projects').select('id').ilike('nombre', body.client_empresa.trim()).is('deleted_at', null).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const seq          = (count ?? 0) + 1
  const numero       = `TICK-${year}-${String(seq).padStart(3, '0')}`
  const autoProjectId = matchedProject?.id ?? null

  const { data: ticket, error } = await admin
    .from('tickets')
    .insert({
      numero,
      titulo:          body.titulo.trim(),
      descripcion:     body.descripcion?.trim() ?? null,
      prioridad:       'media',
      categoria:       body.categoria ?? 'soporte',
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
  ]).catch(() => {})

  return NextResponse.json({ data: { numero, token: ticket.ticket_token, trackingUrl } }, { status: 201 })
}
