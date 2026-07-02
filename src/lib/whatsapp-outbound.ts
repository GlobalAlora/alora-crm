import { createAdminClient } from '@/lib/supabase/admin'
import { sendViaBaileysWorker } from '@/lib/whatsapp-baileys-client'
import { sendViaMetaApi, isMetaConfigured } from '@/lib/whatsapp-meta-client'

type AdminClient = ReturnType<typeof createAdminClient>

export interface SendOutboundParams {
  conversationId: string
  leadId: string | null
  phone: string
  body: string
  agentId?: string | null
}

/**
 * Saves an outbound message, sends it via the Baileys worker, and updates
 * the message status + conversation preview. Shared by the manual "reply
 * from the chat" flow and the automated qualifying bot.
 */
export async function sendOutboundWhatsAppMessage(admin: AdminClient, { conversationId, leadId, phone, body, agentId }: SendOutboundParams): Promise<{ id: string } | null> {
  const { data: savedMsg, error: insertError } = await admin
    .from('wa_messages')
    .insert({
      conversation_id: conversationId,
      lead_id:         leadId,
      direction:       'outbound',
      body,
      status:          'sending',
      agent_id:        agentId ?? null,
    })
    .select('id')
    .single()

  if (insertError || !savedMsg) {
    console.error('[WhatsApp] Failed to save outbound message:', insertError?.message)
    return null
  }

  try {
    // Use Meta Cloud API when configured, fall back to Baileys worker
    const result = isMetaConfigured()
      ? await sendViaMetaApi({ to: phone, body })
      : await sendViaBaileysWorker({ to: phone, body })

    await admin
      .from('wa_messages')
      .update({ status: 'sent', wa_message_id: result.id, status_updated_at: new Date().toISOString() })
      .eq('id', savedMsg.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error al enviar mensaje'
    console.error('[WhatsApp] Outbound send failed:', msg)

    await admin
      .from('wa_messages')
      .update({ status: 'failed', error_message: msg, status_updated_at: new Date().toISOString() })
      .eq('id', savedMsg.id)

    return null
  }

  const preview = body.length > 100 ? body.slice(0, 100) + '…' : body
  await admin
    .from('whatsapp_conversations')
    .update({ last_message_at: new Date().toISOString(), last_message_text: preview, last_message_direction: 'outbound' })
    .eq('id', conversationId)

  return { id: savedMsg.id }
}
