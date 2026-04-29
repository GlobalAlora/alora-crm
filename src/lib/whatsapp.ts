/**
 * WhatsApp Cloud API — utilities
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

// ── Phone normalization ───────────────────────────────────────────────────────

/**
 * Strip everything except digits.
 * Meta sends numbers in E.164 without "+": e.g. "5491155556666"
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

// ── Payload types ─────────────────────────────────────────────────────────────

export interface WhatsAppContact {
  profile: { name: string }
  wa_id: string
}

export interface WhatsAppTextMessage {
  from: string          // sender phone (E.164 without +)
  id: string            // message id
  timestamp: string
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'sticker' | 'reaction' | string
  text?: { body: string }
}

export interface WhatsAppValue {
  messaging_product: 'whatsapp'
  metadata: { display_phone_number: string; phone_number_id: string }
  contacts?: WhatsAppContact[]
  messages?: WhatsAppTextMessage[]
  statuses?: unknown[]
  errors?: unknown[]
}

export interface WhatsAppChange {
  value: WhatsAppValue
  field: string
}

export interface WhatsAppEntry {
  id: string
  changes: WhatsAppChange[]
}

export interface WhatsAppPayload {
  object: 'whatsapp_business_account'
  entry: WhatsAppEntry[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Extract all incoming text messages from the webhook payload.
 * Ignores status updates, reactions, read receipts, etc.
 */
export function extractMessages(payload: WhatsAppPayload): {
  phone: string
  name: string | null
  text: string | null
  rawMessage: WhatsAppTextMessage
  rawValue: WhatsAppValue
}[] {
  const results: ReturnType<typeof extractMessages> = []

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue

      const value = change.value
      const messages = value.messages ?? []
      const contacts = value.contacts ?? []

      for (const msg of messages) {
        // Skip non-incoming (status updates have no "from")
        if (!msg.from) continue

        const contact = contacts.find((c) => c.wa_id === msg.from)
        const name = contact?.profile?.name ?? null
        const text = msg.type === 'text' ? (msg.text?.body ?? null) : null

        results.push({
          phone: normalizePhone(msg.from),
          name,
          text,
          rawMessage: msg,
          rawValue: value,
        })
      }
    }
  }

  return results
}

// ── Outgoing messages (prepared for future use) ────────────────────────────────

export interface SendTextOptions {
  phoneNumberId: string   // Meta phone number ID
  to: string              // recipient phone in E.164
  body: string
  accessToken: string
}

/**
 * Send a text message via WhatsApp Cloud API.
 * Not wired into the CRM UI yet — left ready for future use.
 */
export async function sendWhatsAppText({ phoneNumberId, to, body, accessToken }: SendTextOptions): Promise<unknown> {
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`WhatsApp send failed: ${JSON.stringify(err)}`)
  }
  return res.json()
}
