import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { createLinkedTask } from '@/lib/ticket-task'
import { PORTAL_URL, buildTeamNotifHtml } from '@/lib/ticket-emails'
import { LIDIA_MARKER, LIDIA_AUTHOR } from '@/lib/ticket-brand'
import type { TicketAttachment } from '@/types'

// Tickets creados por LIDIA (soporte por WhatsApp a clínicas clientes).
// Auth: mismo x-webhook-secret que /api/webhooks/lead.
const INTERNAL_EMAIL = 'somosglobalalora@gmail.com'
const INTERNAL_CC    = 'bruno@globalalora.com'
const PRIORIDADES    = ['baja', 'media', 'alta', 'urgente']
const CATEGORIAS     = ['soporte', 'bug', 'consulta', 'mejora']

// Capturas de pantalla que la clínica manda por WhatsApp (base64, sin prefijo data:).
const MAX_IMAGES        = 4
const MAX_IMAGE_BYTES   = 3 * 1024 * 1024
const MAX_TOTAL_BYTES   = 3 * 1024 * 1024 + 512 * 1024 // por request (Vercel corta el body en ~4.5 MB)
const MAX_RESPUESTA_LEN = 3000
const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

function matchesMagic(mime: string, b: Buffer): boolean {
  switch (mime) {
    case 'image/jpeg': return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    case 'image/png':  return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    case 'image/gif':  return b.length > 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1'))
    case 'image/webp': return b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
    default: return false
  }
}

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
    images?: { data?: string; mime?: string; name?: string }[]
    lidia_respuesta?: string
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
    `— ${LIDIA_MARKER}${body.clinic_id ? ` · clínica ${body.clinic_id}` : ''}`,
  ].join('\n').trim()

  const admin = createAdminClient()
  const year  = new Date().getFullYear()

  // Imágenes: se suben ANTES del insert. Cada una en try/catch: si falla, el ticket se crea igual.
  const attachments: TicketAttachment[] = []
  const rawImages = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : []
  let totalBytes = 0
  for (const img of rawImages) {
    try {
      const mime = typeof img?.mime === 'string' ? img.mime.toLowerCase().trim() : ''
      const ext = IMAGE_EXT[mime]
      if (!ext || typeof img?.data !== 'string' || !img.data) continue
      const buf = Buffer.from(img.data, 'base64')
      if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) continue
      if (totalBytes + buf.length > MAX_TOTAL_BYTES) continue
      if (!matchesMagic(mime, buf)) continue
      totalBytes += buf.length
      const path = `lidia/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await admin.storage
        .from('ticket-attachments')
        .upload(path, buf, { contentType: mime, upsert: false })
      if (upErr) { console.error('[lidia-ticket] subida de imagen falló', upErr.message); continue }
      const { data: { publicUrl } } = admin.storage.from('ticket-attachments').getPublicUrl(path)
      attachments.push({ url: publicUrl, name: `captura-${attachments.length + 1}.${ext}`, type: mime })
    } catch (err) {
      console.error('[lidia-ticket] imagen descartada', err)
    }
  }

  const [{ count }, { data: portalClient }] = await Promise.all([
    admin.from('tickets').select('*', { count: 'exact', head: true }).like('numero', `TICK-${year}-%`),
    admin.from('portal_clients').select('project_id').eq('email', clientEmail).maybeSingle(),
  ])

  const numero        = `TICK-${year}-${String((count ?? 0) + 1).padStart(3, '0')}`
  const autoProjectId = portalClient?.project_id ?? null

  const ticketRow = {
      numero,
      titulo,
      descripcion,
      prioridad,
      categoria,
      client_nombre:   body.client_nombre?.trim() || 'Clínica (WhatsApp)',
      client_email:    clientEmail,
      client_empresa:  body.client_empresa?.trim() ?? null,
      client_telefono: body.client_telefono.trim(),
      attachments,
      ...(autoProjectId ? { project_id: autoProjectId } : {}),
  }

  // origen='lidia' marca el ticket; si la columna todavía no existe se reintenta sin ella
  // (el marcador de la descripción sirve de respaldo).
  let ins = await admin.from('tickets').insert({ ...ticketRow, origen: 'lidia' }).select().single()
  if (ins.error && (['42703', 'PGRST204'].includes(ins.error.code) || /origen/i.test(ins.error.message))) {
    ins = await admin.from('tickets').insert(ticketRow).select().single()
  }
  const { data: ticket, error } = ins

  if (error || !ticket) return NextResponse.json({ error: error?.message ?? 'No se pudo crear el ticket' }, { status: 500 })

  // Respuesta de LIDIA al cliente, visible en el seguimiento y en el panel.
  // Directo en DB: la ruta de comentarios mandaría un mail al cliente.
  const respuesta = body.lidia_respuesta?.trim()
  if (respuesta) {
    try {
      const { error: cErr } = await admin.from('ticket_comments').insert({
        ticket_id: ticket.id, user_id: null, is_client: false,
        client_nombre: LIDIA_AUTHOR, body: respuesta.slice(0, MAX_RESPUESTA_LEN), attachments: [],
      })
      if (cErr) console.error('[lidia-ticket] comentario de LIDIA falló', numero, cErr.message)
    } catch (err) { console.error('[lidia-ticket] comentario de LIDIA falló', numero, err) }
  }

  // En Vercel la función se congela al responder: lo que queda sin await no se completa.
  if (autoProjectId) {
    await createLinkedTask({
      id: ticket.id, numero, titulo, prioridad,
      project_id: autoProjectId, attachments,
    }, admin).catch(err => console.error('[lidia-ticket] tarea vinculada falló', numero, err))
  }

  const trackingUrl = `${PORTAL_URL}/${ticket.ticket_token}`

  // Solo aviso interno: la confirmación al cliente la manda LIDIA por WhatsApp.
  await sendGmail({
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
      prioridad, attachments, trackingUrl,
    }),
  }).catch(err => console.error('[lidia-ticket] mail interno falló', numero, err))

  return NextResponse.json({ data: { numero, trackingUrl } }, { status: 201 })
}
