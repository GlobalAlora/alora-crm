import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'

// ── GET /api/cron/meeting-reminders ────────────────────────────────────────────
// Called every 15 min by the VPS cron. Sends a WhatsApp reminder to leads
// whose meeting is in the next 25–45 minutes (window accounts for cron cadence).
// Uses reunion_reminder_sent_at to avoid sending duplicates.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const now = new Date()

  // Window: meeting starts between 25 and 45 minutes from now (AR time = UTC-3)
  const windowStart = new Date(now.getTime() + 25 * 60 * 1000)
  const windowEnd   = new Date(now.getTime() + 45 * 60 * 1000)

  // Find leads with an upcoming meeting that haven't been reminded yet
  const { data: leads, error } = await admin
    .from('leads')
    .select('id, nombre, telefono, fecha_reunion, reunion_hora, reunion_link')
    .eq('estado_pipeline', 'reunion_reservada')
    .is('reunion_reminder_sent_at', null)
    .not('fecha_reunion', 'is', null)
    .not('reunion_hora', 'is', null)
    .not('telefono', 'is', null)
    .is('deleted_at', null)

  if (error) {
    console.error('[MeetingReminder] Failed to fetch leads:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!leads?.length) {
    return NextResponse.json({ status: 'ok', sent: 0 })
  }

  let sent = 0
  const results: { leadId: string; status: string }[] = []

  for (const lead of leads) {
    // Build the meeting datetime in AR time (UTC-3) and convert to UTC for comparison
    const meetingLocal = new Date(`${lead.fecha_reunion}T${lead.reunion_hora}:00-03:00`)

    if (meetingLocal < windowStart || meetingLocal > windowEnd) continue

    // Find the conversation for this lead
    const phone = (lead.telefono ?? '').replace(/\D/g, '')
    if (!phone) continue

    const { data: conv } = await admin
      .from('whatsapp_conversations')
      .select('id')
      .eq('phone_number', phone)
      .maybeSingle()

    if (!conv) {
      console.log(`[MeetingReminder] No conversation for lead ${lead.id}`)
      results.push({ leadId: lead.id, status: 'no_conversation' })
      continue
    }

    const daysFull   = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    const monthsFull = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    const ar = new Date(meetingLocal.getTime())
    const fullLabel = `${daysFull[ar.getDay()]} ${ar.getDate()} de ${monthsFull[ar.getMonth()]} a las ${lead.reunion_hora} hs`

    const firstName = lead.nombre?.split(' ')[0] ?? 'ahí'
    const body = `¡Hola, ${firstName}! 👋 Te recuerdo que en *30 minutos* tenés tu llamada con el equipo de Alora 📅\n\n`
      + `🕐 *${fullLabel}*\n\n`
      + (lead.reunion_link ? `Acá el link: ${lead.reunion_link}\n\n` : '')
      + '¡Nos vemos enseguida! 💛'

    try {
      await sendOutboundWhatsAppMessage(admin, {
        conversationId: conv.id,
        leadId: lead.id,
        phone,
        body,
      })

      // Mark as reminded so we don't send again
      await admin
        .from('leads')
        .update({ reunion_reminder_sent_at: now.toISOString() })
        .eq('id', lead.id)

      sent++
      results.push({ leadId: lead.id, status: 'sent' })
      console.log(`[MeetingReminder] Reminder sent to lead ${lead.id} (${phone}) for ${fullLabel}`)
    } catch (err) {
      console.error(`[MeetingReminder] Failed to send to lead ${lead.id}:`, err)
      results.push({ leadId: lead.id, status: 'error' })
    }
  }

  return NextResponse.json({ status: 'ok', sent, results })
}
