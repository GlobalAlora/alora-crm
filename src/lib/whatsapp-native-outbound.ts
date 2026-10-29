import { createAdminClient } from '@/lib/supabase/admin'
import { findExistingLeadByPhone } from '@/lib/whatsapp-lead-lookup'

type AdminClient = ReturnType<typeof createAdminClient>

export interface NativeOutboundWhatsAppMessage {
  phone: string              // as reported by the worker; non-digits are stripped here
  text: string | null
  waMessageId: string | null
  mediaType?: string | null
}

interface ConversationRef {
  id: string
  lead_id: string | null
}

/**
 * The Baileys worker saw a message leave our WhatsApp number (fromMe). It is
 * either:
 *   (a) an echo of something the CRM itself sent (Lidia, a reminder, the chat
 *       box) — already stored under the same wa_message_id, so it's skipped; or
 *   (b) the team writing from the native WhatsApp app — record it and pause
 *       Lidia, so she doesn't talk over a human.
 *
 * For (b) the conversation may not exist yet: the team writes first to a lead
 * that has never messaged us (e.g. someone who booked a call through the
 * website). It is then created already paused. Otherwise the lead's first
 * reply would open a fresh conversation with the bot on, and Lidia would start
 * her welcome flow right on top of the team's greeting.
 *
 * Safe to retry (the worker retries on 5xx): every step is idempotent.
 */
export async function recordNativeOutboundWhatsAppMessage(admin: AdminClient, msg: NativeOutboundWhatsAppMessage): Promise<void> {
  const phone = msg.phone.replace(/\D/g, '')
  const { text, waMessageId, mediaType } = msg

  if (waMessageId) {
    // Check 1: message already recorded with this wa_message_id (clean case)
    const { count: alreadyRecorded } = await admin
      .from('wa_messages')
      .select('id', { count: 'exact', head: true })
      .eq('wa_message_id', waMessageId)
    if (alreadyRecorded && alreadyRecorded > 0) {
      console.log(`[Bot] SKIP outbound echo waMessageId=${waMessageId} (CRM-sent)`)
      return
    }

    // Check 2: race condition — echo arrived before the CRM updated wa_message_id.
    // A message in 'sending' means the CRM just sent it and is awaiting the worker
    // response. Stamp it with the real wa_message_id and skip the native-outbound path.
    const { data: existingConv } = await admin
      .from('whatsapp_conversations')
      .select('id, lead_id')
      .eq('phone_number', phone)
      .maybeSingle()

    if (existingConv) {
      const since = new Date(Date.now() - 30_000).toISOString()
      const { data: pendingMsg } = await admin
        .from('wa_messages')
        .select('id')
        .eq('conversation_id', existingConv.id)
        .eq('direction', 'outbound')
        .eq('status', 'sending')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pendingMsg) {
        await admin
          .from('wa_messages')
          .update({ wa_message_id: waMessageId, status: 'sent', status_updated_at: new Date().toISOString() })
          .eq('id', pendingMsg.id)
        console.log(`[Bot] SKIP outbound echo (race) waMessageId=${waMessageId} — stamped pending msg ${pendingMsg.id}`)
        return
      }
    }
  }

  const preview = text
    ? (text.length > 100 ? text.slice(0, 100) + '…' : text)
    : '[Mensaje de WhatsApp]'

  // Pause first, record second: stopping the bot is what matters, so a failure
  // saving the message must never leave Lidia switched on.
  const conv = await pauseConversation(admin, phone, preview)

  const { error: msgError } = await admin
    .from('wa_messages')
    .insert({
      conversation_id: conv.id,
      lead_id:         conv.lead_id,
      direction:       'outbound',
      body:            text,
      wa_message_id:   waMessageId,
      status:          'sent',
      media_type:      mediaType ?? null,
    })

  // 23505: the same wa_message_id was delivered twice (worker retry) — already stored.
  if (msgError && msgError.code !== '23505') {
    throw new Error(`Failed to save native outbound message for ${phone}: ${msgError.message}`)
  }
}

/** Leaves the conversation for `phone` paused, creating it first if there is none. */
async function pauseConversation(admin: AdminClient, phone: string, preview: string): Promise<ConversationRef> {
  const paused = {
    bot_active:             false,
    last_message_direction: 'outbound',
    last_message_at:        new Date().toISOString(),
    last_message_text:      preview,
  }

  let conv = await findConversation(admin, phone)

  if (!conv) {
    const created = await createPausedConversation(admin, phone, paused)
    if (created) {
      console.log(`[Bot] PAUSE+RECORD reason=native_wa_outbound_first_contact phone=${phone} conv=${created.id} lead=${created.lead_id ?? 'none'}`)
      return created
    }
    // Lost a race: the lead's reply created the conversation between our lookup and insert.
    conv = await findConversation(admin, phone)
    if (!conv) throw new Error(`Conversation for ${phone} vanished right after a duplicate-key error`)
  }

  await admin.from('whatsapp_conversations').update(paused).eq('id', conv.id).throwOnError()
  console.log(`[Bot] PAUSE+RECORD reason=native_wa_outbound phone=${phone} conv=${conv.id}`)
  return conv
}

async function findConversation(admin: AdminClient, phone: string): Promise<ConversationRef | null> {
  const { data } = await admin
    .from('whatsapp_conversations')
    .select('id, lead_id')
    .eq('phone_number', phone)
    .maybeSingle()
  return data ?? null
}

/** Returns null when phone_number is already taken (unique violation), i.e. someone else created it first. */
async function createPausedConversation(
  admin: AdminClient,
  phone: string,
  paused: Record<string, unknown>,
): Promise<ConversationRef | null> {
  const lead = await findExistingLeadByPhone(admin, phone)

  const { data, error } = await admin
    .from('whatsapp_conversations')
    .insert({ phone_number: phone, lead_id: lead?.id ?? null, ...paused })
    .select('id, lead_id')
    .single()

  if (data) return data
  if (error?.code === '23505') return null
  throw new Error(`Failed to create conversation for ${phone}: ${error?.message ?? 'unknown'}`)
}
