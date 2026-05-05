import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Meta Graph API versions to try (newest first)
const API_VERSIONS = ['v19.0', 'v18.0']

async function fetchPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
): Promise<{ ok: boolean; json: Record<string, unknown>; status: number }> {
  for (const version of API_VERSIONS) {
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    })
    const json = await res.json() as Record<string, unknown>
    if (res.ok) return { ok: true, json, status: res.status }
    // Only retry on 404 (wrong API version)
    if (res.status !== 404) return { ok: false, json, status: res.status }
  }
  return { ok: false, json: {}, status: 404 }
}

async function persistError(admin: ReturnType<typeof createAdminClient>, msg: string) {
  await admin
    .from('channel_configs')
    .update({ last_error: msg, last_error_at: new Date().toISOString() })
    .eq('channel_type', 'whatsapp')
    .eq('label', 'Principal')
}

async function clearError(admin: ReturnType<typeof createAdminClient>) {
  await admin
    .from('channel_configs')
    .update({ last_error: null, last_error_at: null })
    .eq('channel_type', 'whatsapp')
    .eq('label', 'Principal')
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Resolve credentials: DB first, env vars as fallback
  const admin = createAdminClient()
  const { data: cfg } = await admin
    .from('channel_configs')
    .select('access_token, phone_number_id')
    .eq('channel_type', 'whatsapp')
    .eq('label', 'Principal')
    .single()

  const accessToken   = cfg?.access_token   || process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = cfg?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken) {
    return NextResponse.json({ success: false, error: 'Token de acceso no configurado' }, { status: 400 })
  }
  if (!phoneNumberId) {
    return NextResponse.json({ success: false, error: 'Phone Number ID no configurado' }, { status: 400 })
  }

  try {
    // ── 1. Validate token ────────────────────────────────────────────────────
    const tokenRes = await fetch('https://graph.facebook.com/v19.0/me?fields=id,name', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    })

    if (!tokenRes.ok) {
      const tokenErr = await tokenRes.json() as Record<string, unknown>
      const errMsg = (tokenErr?.error as Record<string, unknown>)?.message as string ?? 'Token inválido'
      await persistError(admin, errMsg)
      return NextResponse.json({ success: false, error: `Token inválido o sin permisos: ${errMsg}` })
    }

    // ── 2. Fetch phone number details ────────────────────────────────────────
    const { ok, json, status } = await fetchPhoneNumber(phoneNumberId, accessToken)

    if (!ok) {
      const error  = json?.error as Record<string, unknown> | undefined
      const errMsg = error?.message as string ?? `HTTP ${status}`
      await persistError(admin, errMsg)
      return NextResponse.json({ success: false, error: errMsg })
    }

    // ── 3. Success ────────────────────────────────────────────────────────────
    await clearError(admin)
    return NextResponse.json({
      success:        true,
      phone_number:   json.display_phone_number,
      verified_name:  json.verified_name,
      quality_rating: json.quality_rating,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error de red al contactar Meta'
    return NextResponse.json({ success: false, error: msg })
  }
}
