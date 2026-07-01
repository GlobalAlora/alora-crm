import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'

type AdminClient = ReturnType<typeof createAdminClient>

const WORKER_URL    = process.env.BAILEYS_WORKER_URL!
const WORKER_SECRET = process.env.BAILEYS_WEBHOOK_SECRET!

async function sendWhatsAppReminder(phone: string, body: string) {
  await fetch(`${WORKER_URL}/send`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-secret': WORKER_SECRET },
    body:    JSON.stringify({ phone, message: body }),
  })
}

export async function runMeetingReminders(admin: AdminClient) {
  const now = new Date()

  // Fetch leads with upcoming meetings that haven't been reminded yet
  const { data: leads, error } = await admin
    .from('leads')
    .select('id, nombre, fecha_reunion, reunion_hora, reunion_reminder_24h_at, reunion_reminder_30min_at, telefono')
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
    const diffMs    = meetingAt.getTime() - now.getTime()
    const diffMin   = diffMs / 60_000

    const nombre = lead.nombre || 'Hola'
    const phone  = (lead.telefono as string).replace(/\D/g, '')

    // 24h reminder — window: 23h45m to 24h15m
    if (diffMin >= 1425 && diffMin <= 1455 && !lead.reunion_reminder_24h_at) {
      const daysFull   = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
      const monthsFull = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
      const label = `${daysFull[meetingAt.getDay()]} ${meetingAt.getDate()} de ${monthsFull[meetingAt.getMonth()]} a las ${lead.reunion_hora} hs`

      const body = `¡Hola ${nombre}! 👋 Te recuerdo que *mañana ${label}* tenés tu llamada de relevamiento con Walo 📞\n\nSi necesitás cambiar el horario, avisame con tiempo 🙂`

      try {
        await sendWhatsAppReminder(phone, body)
        await admin.from('leads').update({ reunion_reminder_24h_at: now.toISOString() }).eq('id', lead.id)
        console.log(`[Reminders] 24h reminder sent to lead ${lead.id}`)
        sent++
      } catch (err) {
        console.error(`[Reminders] Failed 24h reminder for lead ${lead.id}:`, err)
      }
    }

    // 30min reminder — window: 15min to 45min
    if (diffMin >= 15 && diffMin <= 45 && !lead.reunion_reminder_30min_at) {
      const body = `¡Hola ${nombre}! 🙂 En *30 minutos* arranca tu llamada con Walo. Preparate tranquilo/a — él se va a conectar en seguida 💛`

      try {
        await sendWhatsAppReminder(phone, body)
        await admin.from('leads').update({ reunion_reminder_30min_at: now.toISOString() }).eq('id', lead.id)
        console.log(`[Reminders] 30min reminder sent to lead ${lead.id}`)
        sent++
      } catch (err) {
        console.error(`[Reminders] Failed 30min reminder for lead ${lead.id}:`, err)
      }
    }
  }

  return { sent }
}
