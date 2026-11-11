import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { createLinkedTask } from '@/lib/ticket-task'
import { PORTAL_URL, buildTeamNotifHtml } from '@/lib/ticket-emails'

// Tickets creados por LIDIA (soporte por WhatsApp a clínicas clientes).
// Auth: mismo x-webhook-secret que /api/webhooks/lead.
const INTERNAL_EMAIL = 'somosglobalalora@gmail.com'
const INTERNAL_CC    = 'bruno@globalalora.com'
const PRIORIDADES    = ['baja', 'media', 'alta', 'urgente']
const CATEGORIAS     = ['soporte', 'bug', 'consulta', 'mejora']

const esc = (v?: string | null) => (v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret')
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: {
    clinic_id?: string
    client_nombre?: string
    client_email?: string
    client_empresa?: string
    client_telefono?: string
    titulo?: string
    descripcion?: string
    prioridad?: string
    categoria?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  if (!body.titulo?.trim() || !body.client_telefono?.trim()) {
    return NextResponse.json({ error: 'titulo y client_telefono son requeridos' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  // Sin mail de la clínica se usa uno interno: el ticket igual se crea y el
  // cliente sigue el estado por WhatsApp.
  const clientEmail = body.client_email && emailRegex.test(body.client_email.trim())
    ? body.client_email.trim().toLowerCase()
    : INTERNAL_EMAIL
  const prioridad = PRIORIDADES.includes(body.prioridad ?? '') ? body.prioridad! : 'media'
  const categoria = CATEGORIAS.includes(body.categoria ?? '') ? body.categoria! : 'soporte'
  const titulo    = body.titulo.trim().slice(0, 200)
  const descripcion = [
    body.descripcion?.trim() ?? '',
    '',
    `— Creado por LIDIA (WhatsApp)${body.clinic_id ? ` · clínica ${body.clinic_id}` : ''}`,
  ].join('\n').trim()

  const admin = createAdminClient()
  const year  = new Date().getFullYear()

  const [{ count }, { data: portalClient }] = await Promise.all([
    admin.from('tickets').select('*', { count: 'exact', head: true }).like('numero', `TICK-${year}-%`),
    admin.from('portal_clients').select('project_id').eq('email', clientEmail).maybeSingle(),
  ])

  const numero        = `TICK-${year}-${String((count ?? 0) + 1).padStart(3, '0')}`
  const autoProjectId = portalClient?.project_id ?? null

  const { data: ticket, error } = await admin
    .from('tickets')
    .insert({
      numero,
      titulo,
      descripcion,
      prioridad,
      categoria,
      client_nombre:   body.client_nombre?.trim() || 'Clínica (WhatsApp)',
      client_email:    clientEmail,
      client_empresa:  body.client_empresa?.trim() ?? null,
      client_telefono: body.client_telefono.trim(),
      attachments:     [],
      ...(autoProjectId ? { project_id: autoProjectId } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (autoProjectId) {
    createLinkedTask({
      id: ticket.id, numero, titulo, prioridad,
      project_id: autoProjectId, attachments: [],
    }, admin).catch(() => {})
  }

  const trackingUrl = `${PORTAL_URL}/${ticket.ticket_token}`

  // Solo aviso interno: la confirmación al cliente la manda LIDIA por WhatsApp.
  sendGmail({
    from:    'info@globalalora.com',
    to:      INTERNAL_EMAIL,
    cc:      INTERNAL_CC,
    subject: `[${numero}] Ticket por WhatsApp (LIDIA): ${titulo}`,
    // El texto viene de un chat de WhatsApp: se escapa antes de ir a un mail HTML.
    html:    buildTeamNotifHtml({
      numero, titulo: esc(titulo), descripcion: esc(descripcion),
      client_nombre: esc(body.client_nombre?.trim() || 'Clínica (WhatsApp)'),
      client_email: esc(clientEmail),
      client_empresa: body.client_empresa ? esc(body.client_empresa) : null,
      client_telefono: body.client_telefono ? esc(body.client_telefono) : null,
      prioridad, attachments: [], trackingUrl,
    }),
  }).catch(() => {})

  return NextResponse.json({ data: { numero, trackingUrl } }, { status: 201 })
}
