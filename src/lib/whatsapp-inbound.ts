import { createAdminClient } from '@/lib/supabase/admin'
import { extractLeadInfoFromConversation } from '@/lib/ai-lead-extract'
import { advanceQualifyingBot } from '@/lib/whatsapp-bot'
import { PAISES, SERVICIOS } from '@/types'

type AdminClient = ReturnType<typeof createAdminClient>

export interface InboundWhatsAppMessage {
  phone: string              // digits only (no leading +)
  name: string | null
  text: string | null
  waMessageId: string | null
  mediaType?: string | null
}

/**
 * Shared by every WhatsApp inbound source (Meta Cloud API, Baileys, etc.):
 * dedupes by wa_message_id, finds/creates the lead by phone, upserts the
 * conversation, and stores the message.
 */
export async function recordInboundWhatsAppMessage(admin: AdminClient, msg: InboundWhatsAppMessage): Promise<void> {
  const { phone, name, text, waMessageId, mediaType } = msg

  if (waMessageId) {
    const { data: existing } = await admin
      .from('wa_messages')
      .select('id')
      .eq('wa_message_id', waMessageId)
      .maybeSingle()

    if (existing) {
      console.log(`[WhatsApp] Duplicate message ignored: ${waMessageId}`)
      return
    }
  }

  const { id: leadId, isNew: isNewLead } = await findOrCreateLeadByPhone(admin, { phone, name, text })

  const previewText = text
    ? (text.length > 100 ? text.slice(0, 100) + '…' : text)
    : '[Mensaje de WhatsApp]'

  const { data: convId, error: convError } = await admin
    .rpc('upsert_wa_conversation', {
      p_phone:     phone,
      p_lead_id:   leadId,
      p_last_text: previewText,
    })

  if (convError || !convId) {
    console.error('[WhatsApp] upsert_wa_conversation failed:', convError?.message)
    return
  }

  const { error: msgError } = await admin
    .from('wa_messages')
    .insert({
      conversation_id: convId,
      lead_id:         leadId,
      direction:       'inbound',
      body:            text,
      wa_message_id:   waMessageId ?? null,
      status:          'read',
      media_type:      mediaType ?? null,
    })

  if (msgError) {
    console.error(`[WhatsApp] Failed to save message from ${phone}:`, msgError.message)
  } else {
    console.log(`[WhatsApp] Message saved from ${phone}`)
  }

  await enrichLeadFromConversation(admin, leadId, convId).catch((err) => {
    console.error('[WhatsApp] AI enrichment failed:', err instanceof Error ? err.message : err)
  })

  await advanceQualifyingBot(admin, { leadId, conversationId: convId, phone, isNewConversation: isNewLead }).catch((err) => {
    console.error('[WhatsApp] Qualifying bot failed:', err instanceof Error ? err.message : err)
  })
}

/**
 * Reads the full conversation so far and fills in empty lead fields
 * (empresa, sitio_web, pais, email, servicios_interesados) from anything
 * the client explicitly mentioned. Never overwrites a field that's already
 * set — only adds what's missing.
 */
async function enrichLeadFromConversation(admin: AdminClient, leadId: string, conversationId: string): Promise<void> {
  const { data: lead } = await admin
    .from('leads')
    .select('empresa, sitio_web, pais, email, servicios_interesados')
    .eq('id', leadId)
    .single()

  if (!lead) return

  const { data: messages } = await admin
    .from('wa_messages')
    .select('direction, body')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(50)

  if (!messages || messages.length === 0) return

  const extracted = await extractLeadInfoFromConversation(messages)
  if (!extracted) return

  const updates: Record<string, unknown> = {}

  if (!lead.empresa && extracted.empresa) updates.empresa = extracted.empresa
  if (!lead.sitio_web && extracted.sitio_web) updates.sitio_web = extracted.sitio_web
  if (!lead.email && extracted.email) updates.email = extracted.email
  if (!lead.pais && extracted.pais && (PAISES as readonly string[]).includes(extracted.pais)) {
    updates.pais = extracted.pais
  }

  if (extracted.servicios_interesados?.length) {
    const existing = new Set<string>(lead.servicios_interesados ?? [])
    for (const s of extracted.servicios_interesados) {
      if ((SERVICIOS as readonly string[]).includes(s)) existing.add(s)
    }
    const merged = [...existing]
    if (merged.length !== (lead.servicios_interesados ?? []).length) {
      updates.servicios_interesados = merged
    }
  }

  if (Object.keys(updates).length === 0) return

  const { error } = await admin.from('leads').update(updates).eq('id', leadId)
  if (error) {
    console.error('[WhatsApp] Failed to save AI-enriched lead fields:', error.message)
  } else {
    console.log(`[WhatsApp] Lead ${leadId} enriched from conversation:`, updates)
  }
}

/**
 * Called when the Baileys worker resolves a contact's opaque "LID" to their
 * real phone number (via WhatsApp's contacts sync). Fixes up any lead/
 * conversation that was created using the LID as a stand-in phone number.
 */
export async function resolveLidPhone(admin: AdminClient, oldPhone: string, newPhone: string): Promise<void> {
  const { error: leadError } = await admin
    .from('leads')
    .update({ telefono: newPhone })
    .or(`telefono.eq.${oldPhone},telefono.eq.+${oldPhone}`)

  if (leadError) {
    console.error('[WhatsApp] Failed to migrate lead phone from LID:', leadError.message)
  }

  const { error: convError } = await admin
    .from('whatsapp_conversations')
    .update({ phone_number: newPhone })
    .eq('phone_number', oldPhone)

  if (convError) {
    console.error('[WhatsApp] Failed to migrate conversation phone from LID:', convError.message)
  }

  console.log(`[WhatsApp] Migrated phone ${oldPhone} -> ${newPhone}`)
}

async function findOrCreateLeadByPhone(
  admin: AdminClient,
  { phone, name, text }: { phone: string; name: string | null; text: string | null },
): Promise<{ id: string; isNew: boolean }> {
  const { data: existing } = await admin
    .from('leads')
    .select('id, nombre')
    .or(`telefono.eq.${phone},telefono.eq.+${phone}`)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (existing) {
    console.log(`[WhatsApp] Existing lead: ${existing.id} (${existing.nombre})`)
    return { id: existing.id, isNew: false }
  }

  // Assign all incoming leads to Walo
  const { data: walo } = await admin
    .from('users')
    .select('id')
    .eq('email', 'somosglobalalora@gmail.com')
    .maybeSingle()

  const responsableId: string | null = walo?.id ?? null

  const { data: maxPos } = await admin
    .from('leads')
    .select('kanban_position')
    .eq('estado_pipeline', 'lead_entrante')
    .is('deleted_at', null)
    .order('kanban_position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: newLead, error } = await admin
    .from('leads')
    .insert({
      nombre:          name || 'Contacto WhatsApp',
      telefono:        phone,
      fuente:          'whatsapp',
      estado_pipeline: 'lead_entrante',
      kanban_position: (maxPos?.kanban_position ?? 0) + 1,
      responsable_id:  responsableId,
      created_by:      responsableId,
      notas:           text ? `Primer mensaje: ${text}` : null,
    })
    .select('id, nombre')
    .single()

  if (error || !newLead) {
    throw new Error(`Failed to create lead: ${error?.message ?? 'unknown'}`)
  }

  console.log(`[WhatsApp] New lead created: ${newLead.id} (${newLead.nombre})`)
  return { id: newLead.id, isNew: true }
}
