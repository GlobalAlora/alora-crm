import type { SupabaseClient } from '@supabase/supabase-js'
import { getTicketBrand } from './ticket-brand'

// Avisa a LIDIA que el equipo respondió un ticket que ella creó por WhatsApp (o cambió su estado),
// para que se lo mande a la clínica por el mismo chat.
//   'sent'    -> LIDIA lo mandó por WhatsApp: no hace falta el mail al cliente.
//   'skipped' -> no es un ticket de LIDIA (o no tiene teléfono): se mantiene el mail de siempre.
//   'failed'  -> LIDIA no pudo (caída, soporte apagado para ese teléfono...): usar el mail como respaldo.
// Debe llamarse con await: en Vercel la función se congela al responder.
const DEFAULT_URL = 'https://soylidia.com/api/support/ticket-update'

export type LidiaNotifyResult = 'sent' | 'skipped' | 'failed'

export async function notifyLidiaWhatsApp(
  admin: SupabaseClient,
  ticketId: string,
  update: { estado?: string | null; comentario?: string | null },
): Promise<LidiaNotifyResult> {
  try {
    const { data: t } = await admin
      .from('tickets')
      .select('numero,descripcion,client_telefono')
      .eq('id', ticketId)
      .maybeSingle()
    if (!t?.client_telefono) return 'skipped'
    if ((await getTicketBrand(admin, ticketId, t.descripcion)) !== 'lidia') return 'skipped'

    const secret = process.env.LIDIA_SUPPORT_CALLBACK_SECRET || process.env.WEBHOOK_SECRET
    if (!secret) return 'failed'

    const res = await fetch(process.env.LIDIA_SUPPORT_CALLBACK_URL || DEFAULT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-secret': secret },
      body: JSON.stringify({
        telefono: t.client_telefono,
        numero: t.numero,
        ...(update.estado ? { estado: update.estado } : {}),
        ...(update.comentario ? { comentario: update.comentario } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return 'failed'
    const json = (await res.json().catch(() => null)) as { sent?: boolean } | null
    return json?.sent ? 'sent' : 'failed'
  } catch (err) {
    console.error('[lidia-notify] no se pudo avisar a LIDIA', err)
    return 'failed'
  }
}
