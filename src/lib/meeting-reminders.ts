import { sendGmail } from '@/lib/google-gmail'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'

type AdminClient = ReturnType<typeof createAdminClient>

const BRAND    = '#1B4040'
const BRAND_BG = '#EEF4F4'
const BRAND_LT = '#E0EEEE'
const WA_NUMBER = process.env.WHATSAPP_PHONE_NUMBER ?? '5491140473276'

const DAYS   = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function formatDateAR(date: Date): string {
  const ar = new Date(date.getTime() - 3 * 3_600_000)
  return `${DAYS[ar.getUTCDay()]} ${ar.getUTCDate()} de ${MONTHS[ar.getUTCMonth()]} a las ${ar.getUTCHours().toString().padStart(2, '0')}:${ar.getUTCMinutes().toString().padStart(2, '0')} hs`
}

async function reminderAlreadySent(admin: AdminClient, leadId: string, tipo: '24h' | '2h'): Promise<boolean> {
  const { data } = await admin
    .from('activities')
    .select('metadata')
    .eq('lead_id', leadId)
    .eq('tipo', 'recordatorio')
  if (!data || data.length === 0) return false
  return data.some((a: { metadata?: Record<string, unknown> }) => a.metadata?.recordatorio_tipo === tipo)
}

async function logReminder(admin: AdminClient, leadId: string, tipo: '24h' | '2h'): Promise<void> {
  await admin.from('activities').insert({
    lead_id:     leadId,
    user_id:     null,
    tipo:        'recordatorio',
    descripcion: `Recordatorio de reunión enviado (${tipo} antes)`,
    metadata:    { recordatorio_tipo: tipo },
  })
}

interface ReminderLead {
  id: string
  nombre: string | null
  apellido: string | null
  email: string | null
  reunion_link: string | null
  calendar_event_url: string | null
}

async function getWhatsAppConversation(admin: AdminClient, leadId: string): Promise<{ id: string; phone_number: string } | null> {
  const { data } = await admin
    .from('whatsapp_conversations')
    .select('id, phone_number')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

async function sendWhatsApp(admin: AdminClient, lead: ReminderLead, body: string): Promise<boolean> {
  const conv = await getWhatsAppConversation(admin, lead.id)
  if (!conv) return false
  const result = await sendOutboundWhatsAppMessage(admin, {
    conversationId: conv.id,
    leadId:         lead.id,
    phone:          conv.phone_number,
    body,
  })
  return !!result
}

async function send24hReminder(admin: AdminClient, lead: ReminderLead, meetingDate: Date): Promise<void> {
  const name      = [lead.nombre, lead.apellido].filter(Boolean).join(' ') || 'ahí'
  const fullLabel = formatDateAR(meetingDate)
  const meetLink  = lead.reunion_link ?? lead.calendar_event_url ?? null

  const waBody = `⏰ ¡Hola ${lead.nombre ?? ''}! Te recordamos que mañana tenés tu llamada de relevamiento con el equipo de Alora.\n\n📅 ${fullLabel}${meetLink ? `\n\n🔗 Link de la videollamada:\n${meetLink}` : ''}\n\nSi necesitás cambiar el horario, avisanos y lo coordinamos 🙂`
  await sendWhatsApp(admin, lead, waBody)

  if (lead.email) {
    const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Hola, necesito reprogramar mi reunión de mañana (${fullLabel})`)}`
    await sendGmail({
      from:    'info@globalalora.com',
      to:      lead.email,
      toName:  name,
      subject: `Recordatorio: tu reunión con Alora es mañana — ${fullLabel}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:${BRAND_BG};padding:32px;border-radius:12px">
          <div style="background:${BRAND};border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
            <img src="https://globalalora.com/logo-web.png" alt="Alora" style="height:40px;margin-bottom:12px;filter:brightness(0) invert(1)" onerror="this.style.display='none'">
            <h1 style="color:#fff;margin:0;font-size:20px">⏰ Recordatorio de reunión</h1>
          </div>
          <div style="background:#fff;border-radius:8px;padding:24px;border:1px solid #d1e0e0">
            <p style="margin:0 0 16px;font-size:15px;color:#374151">Hola <strong>${name}</strong>,</p>
            <p style="margin:0 0 20px;font-size:15px;color:#374151">Te recordamos que mañana tenés una llamada de relevamiento con el equipo de <strong>Alora</strong>:</p>
            <div style="background:${BRAND_LT};border-left:4px solid ${BRAND};padding:16px;border-radius:0 8px 8px 0;margin-bottom:20px">
              <p style="margin:0;font-size:18px;font-weight:700;color:${BRAND}">📅 ${fullLabel}</p>
            </div>
            ${meetLink ? `<div style="text-align:center;margin-bottom:20px">
              <a href="${meetLink}" style="display:inline-block;background:${BRAND};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">🔗 Unirse a la videollamada</a>
            </div>` : ''}
            <p style="margin:0;font-size:13px;color:#6b7280;text-align:center">
              Si necesitás cambiar el horario,
              <a href="${waLink}" style="color:${BRAND}">escribinos por WhatsApp</a>
              o respondé este email.
            </p>
          </div>
          <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">Alora · globalalora.com</p>
        </div>
      `,
    })
  }

  await logReminder(admin, lead.id, '24h')
}

async function send2hReminder(admin: AdminClient, lead: ReminderLead, meetingDate: Date): Promise<void> {
  const name      = [lead.nombre, lead.apellido].filter(Boolean).join(' ') || 'ahí'
  const fullLabel = formatDateAR(meetingDate)
  const meetLink  = lead.reunion_link ?? lead.calendar_event_url ?? null

  const waBody = `🚀 ¡Hola ${lead.nombre ?? ''}! Tu reunión con Alora es en 2 horas ⏰\n\n📅 ${fullLabel}${meetLink ? `\n\n🔗 Link de la videollamada:\n${meetLink}` : ''}\n\n¿Podés confirmar que vas a estar? Respondé con *"Confirmo"* o avisanos si necesitás reprogramar 🙏`
  await sendWhatsApp(admin, lead, waBody)

  if (lead.email) {
    const waConfirm = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Confirmo mi asistencia a la reunión de hoy (${fullLabel}) ✅`)}`
    const waCancel  = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Necesito cancelar o reprogramar la reunión de hoy (${fullLabel})`)}`
    await sendGmail({
      from:    'info@globalalora.com',
      to:      lead.email,
      toName:  name,
      subject: `¡En 2 horas! Tu reunión con Alora — ${fullLabel}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:${BRAND_BG};padding:32px;border-radius:12px">
          <div style="background:${BRAND};border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
            <img src="https://globalalora.com/logo-web.png" alt="Alora" style="height:40px;margin-bottom:12px;filter:brightness(0) invert(1)" onerror="this.style.display='none'">
            <h1 style="color:#fff;margin:0;font-size:20px">🚀 ¡Tu reunión es en 2 horas!</h1>
          </div>
          <div style="background:#fff;border-radius:8px;padding:24px;border:1px solid #d1e0e0">
            <p style="margin:0 0 16px;font-size:15px;color:#374151">Hola <strong>${name}</strong>,</p>
            <p style="margin:0 0 20px;font-size:15px;color:#374151">¡Tu llamada de relevamiento con Alora es en menos de 2 horas!</p>
            <div style="background:${BRAND_LT};border-left:4px solid ${BRAND};padding:16px;border-radius:0 8px 8px 0;margin-bottom:24px">
              <p style="margin:0;font-size:18px;font-weight:700;color:${BRAND}">📅 ${fullLabel}</p>
            </div>
            ${meetLink ? `<div style="text-align:center;margin-bottom:24px">
              <a href="${meetLink}" style="display:inline-block;background:${BRAND};color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">🔗 Unirse a la videollamada</a>
            </div>` : ''}
            <div style="border-top:1px solid #e5e7eb;padding-top:20px">
              <p style="margin:0 0 14px;font-size:14px;color:#374151;font-weight:600;text-align:center">¿Podés confirmar tu asistencia?</p>
              <div style="text-align:center">
                <a href="${waConfirm}" style="display:inline-block;background:#22c55e;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;margin-right:8px">✅ Confirmar</a>
                <a href="${waCancel}" style="display:inline-block;background:#f3f4f6;color:#374151;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px">❌ Cancelar / Reprogramar</a>
              </div>
            </div>
          </div>
          <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px">Alora · globalalora.com</p>
        </div>
      `,
    })
  }

  await logReminder(admin, lead.id, '2h')
}

export async function runMeetingReminders(admin: AdminClient): Promise<{ sent24h: number; sent2h: number; skipped: number }> {
  const now = Date.now()

  const { data: leads } = await admin
    .from('leads')
    .select('id, nombre, apellido, email, reunion_link, calendar_event_url, fecha_reunion, reunion_hora')
    .eq('estado_pipeline', 'reunion_reservada')
    .is('deleted_at', null)
    .not('fecha_reunion', 'is', null)
    .not('reunion_hora', 'is', null)

  if (!leads || leads.length === 0) return { sent24h: 0, sent2h: 0, skipped: 0 }

  let sent24h = 0
  let sent2h  = 0
  let skipped = 0

  for (const lead of leads) {
    if (!lead.email) { skipped++; continue }

    const meetingMs  = new Date(`${lead.fecha_reunion}T${lead.reunion_hora}:00-03:00`).getTime()
    const hoursUntil = (meetingMs - now) / 3_600_000

    if (hoursUntil < 0) { skipped++; continue }

    const meetingDate = new Date(meetingMs)

    if (hoursUntil >= 23 && hoursUntil <= 25) {
      if (await reminderAlreadySent(admin, lead.id, '24h')) { skipped++; continue }
      try { await send24hReminder(admin, lead as ReminderLead, meetingDate); sent24h++ }
      catch (err) { console.error(`[Reminders] 24h failed lead=${lead.id}:`, err) }
    }

    if (hoursUntil >= 1.5 && hoursUntil <= 2.5) {
      if (await reminderAlreadySent(admin, lead.id, '2h')) { skipped++; continue }
      try { await send2hReminder(admin, lead as ReminderLead, meetingDate); sent2h++ }
      catch (err) { console.error(`[Reminders] 2h failed lead=${lead.id}:`, err) }
    }
  }

  return { sent24h, sent2h, skipped }
}
