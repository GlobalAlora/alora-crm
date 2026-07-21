import { createAdminClient } from '@/lib/supabase/admin'
import { extractLeadInfoFromConversation } from '@/lib/ai-lead-extract'
import { runBot } from '@/lib/whatsapp-bot'
import { notifyAll } from '@/lib/push-notify'
import { PAISES, SERVICIOS } from '@/types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$|^[^\s]+\.[a-z]{2,}([/?#][^\s]*)?$/i

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
  // Normalize phone: strip everything except digits so "+549..." and "549..." always resolve to the same lead.
  const phone = msg.phone.replace(/\D/g, '')
  const { name, text, waMessageId, mediaType } = msg

  const leadId = await findOrCreateLeadByPhone(admin, { phone, name, text })

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

  // The actual dedup guard: a unique constraint on wa_message_id makes this
  // INSERT the single source of truth, so two near-simultaneous deliveries
  // of the same WhatsApp message (Baileys retries on decrypt failures) can
  // never both proceed past this point, no matter how close together they run.
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
    if (msgError.code === '23505') {
      console.log(`[WhatsApp] Duplicate message ignored: ${waMessageId}`)
    } else {
      console.error(`[WhatsApp] Failed to save message from ${phone}:`, msgError.message)
    }
    return
  }

  console.log(`[WhatsApp] Message saved from ${phone}`)

  // The lead replied — they're no longer silent, so reset the follow-up clock.
  await admin
    .from('whatsapp_conversations')
    .update({ last_message_direction: 'inbound', followup_count: 0 })
    .eq('id', convId)

  // Push notification to the team for every inbound message
  const { data: leadInfo } = await admin
    .from('leads').select('nombre, apellido').eq('id', leadId).single()
  const leadLabel = [leadInfo?.nombre, leadInfo?.apellido].filter(Boolean).join(' ') || `+${phone}`
  notifyAll({
    title: `💬 Nuevo mensaje — ${leadLabel}`,
    body:  text ? (text.length > 80 ? text.slice(0, 80) + '…' : text) : 'Mensaje de WhatsApp',
    url:   `/leads/${leadId}`,
  }).catch(() => {})

  await enrichLeadFromConversation(admin, leadId, convId).catch((err) => {
    console.error('[WhatsApp] AI enrichment failed:', err instanceof Error ? err.message : err)
  })

  await runBot(admin, { leadId, conversationId: convId, phone, text }).catch((err) => {
    console.error('[WhatsApp] Bot failed:', err instanceof Error ? err.message : err)
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
  if (!lead.sitio_web && extracted.sitio_web && URL_RE.test(extracted.sitio_web.trim())) {
    updates.sitio_web = extracted.sitio_web.trim()
  }
  if (!lead.email && extracted.email && EMAIL_RE.test(extracted.email.trim())) {
    updates.email = extracted.email.trim()
  }
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
): Promise<string> {
  // Search both "5492644..." and "+5492644..." — old leads may have been stored
  // with the + prefix. Using two .eq() calls avoids URL-encoding issues with +
  // inside a PostgREST .or() filter.
  const withPlus = `+${phone}`
  // Two separate .eq() calls: .in([phone, withPlus]) URL-encodes the + as space,
  // causing leads stored with +prefix to not be found (original bug source).
  const { data: byDigits } = await admin
    .from('leads')
    .select('id, nombre, estado_pipeline')
    .eq('telefono', phone)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  const existing = byDigits ?? await (async () => {
    const { data } = await admin
      .from('leads')
      .select('id, nombre, estado_pipeline')
      .eq('telefono', withPlus)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    return data
  })()

  if (existing && existing.estado_pipeline !== 'testing') {
    console.log(`[WhatsApp] Existing lead: ${existing.id} (${existing.nombre})`)
    return existing.id
  }

  if (existing?.estado_pipeline === 'testing') {
    console.log(`[WhatsApp] Testing lead ignored — creating new lead for ${phone}`)
    // Free up the phone number so the new lead can use it
    await admin.from('leads').update({ telefono: `test_${phone}` }).eq('id', existing.id)
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

  // Only use the WhatsApp display name if it looks like an actual name
  // (1-2 words, short). Baileys sometimes sends the first message text as
  // the contact name when no profile name is set (e.g. "Crear una app").
  // 3-word phrases are often sentences/commands, so we reject them here;
  // the qualifying bot will ask for the real name anyway.
  const words = (name ?? '').trim().split(/\s+/)
  const GREETING_RE = /^(buen[ao]s?|hola|buenas|saludos|greetings|good\s+(morning|afternoon|evening|day)|hi|hey)\b/i
  const cleanName = name && words.length <= 2 && name.length <= 30 && !GREETING_RE.test(name.trim()) ? name : null

  const { data: newLead, error } = await admin
    .from('leads')
    .insert({
      nombre:          cleanName || `+${phone}`,
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
    // Race condition: another concurrent webhook created the lead a few ms earlier.
    // The unique index on telefono fires a 23505; re-query and return that lead.
    if (error?.code === '23505') {
      const { data: raced } = await admin
        .from('leads')
        .select('id, nombre')
        .in('telefono', [phone, withPlus])
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()
      if (raced) {
        console.log(`[WhatsApp] Race resolved — existing lead: ${raced.id} (${raced.nombre})`)
        return raced.id
      }
    }
    throw new Error(`Failed to create lead: ${error?.message ?? 'unknown'}`)
  }

  console.log(`[WhatsApp] New lead created: ${newLead.id} (${newLead.nombre})`)
  return newLead.id
}
