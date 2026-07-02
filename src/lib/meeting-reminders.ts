import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'

type AdminClient = ReturnType<typeof createAdminClient>

const DAYS   = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

async function sendReminder(
  admin: AdminClient,
  lead: { id: string; nombre: string | null; telefono: string },
  body: string,
) {
  const phone = lead.telefono.replace(/\D/g, '')

  const { data: conv } = await admin
    .from('whatsapp_conversations')
    .select('id')
    .eq('phone_number', phone)
    .maybeSingle()

  if (!conv) {
    console.warn(`[Reminders] No conversation for lead ${lead.id}`)
    return false
  }

  await sendOutboundWhatsAppMessage(admin, {
    conversationId: conv.id,
    leadId: lead.id,
    phone,
    body,
  })
  return true
}

export async function runMeetingReminders(admin: AdminClient) {
  const now = new Date()

  const { data: leads, error } = await admin
    .from('leads')
    .select('id, nombre, fecha_reunion, reunion_hora, reunion_reminder_24h_at, reunion_reminder_30min_at, telefono, reunion_link')
    .not('fecha_reunion', 'is', null)
    .not('reunion_hora', 'is', null)
    .not('telefono', 'is', null)
    .is('deleted_at', null)

  if (error || !leads) {
    console.error('[Reminders] Failed to fetch leads:', error?.message)
    return { sent: 0 }
  }

  let sent = 0

  for (const lead of leads) {
    const meetingAt = new Date(`${lead.fecha_reunion}T${lead.reunion_hora}:00-03:00`)
    const diffMin   = (meetingAt.getTime() - now.getTime()) / 60_000
    const nombre    = lead.nombre?.split(' ')[0] || 'ahí'
    const link      = lead.reunion_link as string | null

    // 24h reminder — window: 23h45m to 24h15m before meeting
    if (diffMin >= 1425 && diffMin <= 1455 && !lead.reunion_reminder_24h_at) {
      const label = `${DAYS[meetingAt.getDay()]} ${meetingAt.getDate()} de ${MONTHS[meetingAt.getMonth()]} a las ${lead.reunion_hora} hs`
      const body = `¡Hola, ${nombre}! 👋 Te recuerdo que *mañana tenés tu llamada con Walo* 📅\n\n`
        + `🕐 ${label}\n\n`
        + (link ? `🔗 Link: ${link}\n\n` : '')
        + `Si necesitás cambiar el horario, avisame con tiempo 🙂`

      try {
        const ok = await sendReminder(admin, lead, body)
        if (ok) {
          await admin.from('leads').update({ reunion_reminder_24h_at: now.toISOString() }).eq('id', lead.id)
          console.log(`[Reminders] 24h reminder sent → lead ${lead.id}`)
          sent++
        }
      } catch (err) {
        console.error(`[Reminders] 24h reminder failed for lead ${lead.id}:`, err)
      }
    }

    // 30min reminder — window: 15min to 45min before meeting
    if (diffMin >= 15 && diffMin <= 45 && !lead.reunion_reminder_30min_at) {
      const body = `¡Hola, ${nombre}! 🙂 En *30 minutos* arranca tu llamada con Walo. Preparate tranquilo/a — él se conecta enseguida 💛`
        + (link ? `\n\n🔗 Link: ${link}` : '')

      try {
        const ok = await sendReminder(admin, lead, body)
        if (ok) {
          await admin.from('leads').update({ reunion_reminder_30min_at: now.toISOString() }).eq('id', lead.id)
          console.log(`[Reminders] 30min reminder sent → lead ${lead.id}`)
          sent++
        }
      } catch (err) {
        console.error(`[Reminders] 30min reminder failed for lead ${lead.id}:`, err)
      }
    }
  }

  return { sent }
}
