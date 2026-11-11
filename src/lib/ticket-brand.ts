import type { SupabaseClient } from '@supabase/supabase-js'

// Marca de los tickets creados por LIDIA (soporte por WhatsApp).
// Fuente de verdad: columna tickets.origen = 'lidia' (opcional, ver
// scripts/ticket-origen-migration.sql). Respaldo: el marcador que el webhook
// escribe al final de la descripción. Todo funciona sin la columna.
export const LIDIA_MARKER = 'Creado por LIDIA (WhatsApp)'
export const LIDIA_AUTHOR = 'LIDIA'

export type TicketBrand = 'lidia' | null

export function brandFromDescripcion(descripcion?: string | null): TicketBrand {
  return descripcion?.includes(LIDIA_MARKER) ? 'lidia' : null
}

// Consulta APARTE y tolerante: si la columna `origen` no existe, jamás debe
// romper el seguimiento ni los mails de otros clientes.
export async function getTicketBrand(
  admin: SupabaseClient,
  ticketId: string,
  descripcion?: string | null,
): Promise<TicketBrand> {
  if (brandFromDescripcion(descripcion)) return 'lidia'
  try {
    const { data, error } = await admin.from('tickets').select('origen').eq('id', ticketId).maybeSingle()
    if (!error && (data as { origen?: string | null } | null)?.origen === 'lidia') return 'lidia'
  } catch { /* columna inexistente: se ignora */ }
  if (descripcion != null) return null
  try {
    const { data } = await admin.from('tickets').select('descripcion').eq('id', ticketId).maybeSingle()
    return brandFromDescripcion((data as { descripcion?: string | null } | null)?.descripcion)
  } catch { return null }
}

export const BRANDS = {
  lidia: {
    name: 'LIDIA',
    logo: '/logo-lidia.png',
    headerBg: '#1a0b2e',
    footerText: 'LIDIA · Soporte por WhatsApp',
    teamBadge: 'LIDIA',
  },
} as const
