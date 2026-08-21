import { createAdminClient } from '@/lib/supabase/admin'
import { sendOutboundWhatsAppMessage } from '@/lib/whatsapp-outbound'
import { isClientLead } from '@/lib/whatsapp-bot'
import { notifyAll } from '@/lib/push-notify'

type AdminClient = ReturnType<typeof createAdminClient>

const FOLLOWUP_HOURS = [0.5, 24] // hours of silence required before follow-up #1 (30 min), then #2 (24 h)

export const FOLLOWUP_TEXT = [
  '¡Hola! 👋 Vi que quedamos en contacto pero no supe más de vos — ¿seguís por ahí? Si tenés alguna duda o querés que sigamos viendo tu proyecto, contame 🙂',
  '¡Hola de nuevo! Te escribo por última vez para ver si seguís interesado/a — si en algún momento querés retomar, escribime tranquilo, quedo atenta 💛',
]

interface StaleConversation {
  id: string
  phone_number: string
  lead_id: string | null
  last_message_at: string
  followup_count: number
}

/**
 * Sends a follow-up to conversations Lidia is still handling (bot_active)
 * where the lead went quiet after our last message. Up to FOLLOWUP_TEXT.length
 * reminders, spaced FOLLOWUP_HOURS apart; after that we stop on our own.
 * Replying resets followup_count back to 0 (see recordInboundWhatsAppMessage).
 */
export async function runWhatsAppFollowUps(admin: AdminClient): Promise<{ sent: number; checked: number }> {
  const { data: candidates, error } = await admin
    .from('whatsapp_conversations')
    .select('id, phone_number, lead_id, last_message_at, followup_count')
    .eq('bot_active', true)
    .eq('last_message_direction', 'outbound')
    .lt('followup_count', FOLLOWUP_TEXT.length)

  if (error) {
    console.error('[WhatsApp] Failed to list follow-up candidates:', error.message)
    return { sent: 0, checked: 0 }
  }

  const rows = (candidates ?? []) as StaleConversation[]
  const now = Date.now()
  let sent = 0

  for (const conv of rows) {
    const hoursSince = (now - new Date(conv.last_message_at).getTime()) / 3_600_000
    const threshold = FOLLOWUP_HOURS[conv.followup_count]
    if (hoursSince < threshold) continue

    // Never follow up on disqualified leads — they've been ruled out, silence is intentional.
    if (conv.lead_id) {
      const { data: lead } = await admin
        .from('leads')
        .select('estado_pipeline')
        .eq('id', conv.lead_id)
        .single()

      if (lead?.estado_pipeline === 'no_cualificado' || lead?.estado_pipeline === 'consulta_cliente' || lead?.estado_pipeline === 'testing') {
        await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conv.id)
        continue
      }

      // Never follow up on leads that already booked a meeting — they're in the funnel.
      if (lead?.estado_pipeline === 'reunion_reservada') continue
    }

    // Never chase up an existing client — they're not a lead going cold.
    if (conv.lead_id && await isClientLead(admin, conv.lead_id)) {
      await admin.from('whatsapp_conversations').update({ bot_active: false }).eq('id', conv.id)
      continue
    }

    const result = await sendOutboundWhatsAppMessage(admin, {
      conversationId: conv.id,
      leadId:         conv.lead_id,
      phone:          conv.phone_number,
      body:           FOLLOWUP_TEXT[conv.followup_count],
    })

    if (!result) continue

    const newCount = conv.followup_count + 1
    await admin
      .from('whatsapp_conversations')
      .update({ followup_count: newCount })
      .eq('id', conv.id)

    // Last follow-up just sent — alert team
    if (newCount >= FOLLOWUP_TEXT.length && conv.lead_id) {
      const { data: lead } = await admin.from('leads').select('nombre, apellido').eq('id', conv.lead_id).maybeSingle()
      const name = [lead?.nombre, lead?.apellido].filter(Boolean).join(' ') || conv.phone_number
      notifyAll({
        title: `🥶 ${name} no respondió a ningún follow-up`,
        body:  'Ya enviamos los 2 mensajes de seguimiento. ¿Lo cerramos o lo dejamos?',
        url:   `/leads/${conv.lead_id}`,
      }).catch(() => {})
    }

    sent++
  }

  return { sent, checked: rows.length }
}
