/**
 * Client for the Baileys worker — a separate always-on Node process that
 * holds the WhatsApp Web session and actually talks to WhatsApp.
 * See /whatsapp-worker for the worker itself.
 */

export interface SendViaBaileysOptions {
  to: string      // phone digits only, no leading +
  body: string
}

export async function sendViaBaileysWorker({ to, body }: SendViaBaileysOptions): Promise<{ id: string | null }> {
  const workerUrl = process.env.BAILEYS_WORKER_URL
  const secret    = process.env.BAILEYS_WORKER_SECRET

  if (!workerUrl || !secret) {
    throw new Error('BAILEYS_WORKER_URL / BAILEYS_WORKER_SECRET no configurados')
  }

  const res = await fetch(`${workerUrl}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': secret,
    },
    body: JSON.stringify({ phone: to, message: body }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `Baileys worker respondió ${res.status}`)
  }

  return res.json()
}
