import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export interface ExistingLead {
  id: string
  nombre: string
  estado_pipeline: string
}

/**
 * Finds the (non-deleted) lead that owns a WhatsApp phone number, or null.
 * `phone` is digits only, as WhatsApp delivers it.
 */
export async function findExistingLeadByPhone(admin: AdminClient, phone: string): Promise<ExistingLead | null> {
  // Search by phone in multiple formats:
  // 1. Digits-only (how WhatsApp delivers it)
  // 2. With + prefix (how old leads were stored)
  // 3. Normalized via SQL regex (handles any formatting like "+54 9 3772 63-4401")
  const withPlus = `+${phone}`

  const [{ data: byDigits }, { data: byPlus }] = await Promise.all([
    admin.from('leads').select('id, nombre, estado_pipeline').eq('telefono', phone).is('deleted_at', null).limit(1).maybeSingle(),
    admin.from('leads').select('id, nombre, estado_pipeline').eq('telefono', withPlus).is('deleted_at', null).limit(1).maybeSingle(),
  ])

  const exact = byDigits ?? byPlus
  if (exact) return exact

  // Fallback: normalize both sides (strips spaces, dashes, parentheses, +)
  // Catches manually-entered phones like "+54 9 3772 63-4401" vs "5493772634401"
  const { data: normalized } = await admin.rpc('find_lead_by_normalized_phone', { p_phone: phone })
  const match = (normalized as ExistingLead[] | null)?.[0] ?? null
  if (match) {
    console.log(`[WhatsApp] Matched lead by normalized phone: ${match.id} (${match.nombre})`)
  }
  return match
}
