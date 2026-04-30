import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  // Call Meta Graph API to verify the phone number
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8_000),
      }
    )

    const json = await res.json() as Record<string, unknown>

    if (!res.ok) {
      const errMsg = (json?.error as Record<string, unknown>)?.message as string
        ?? `HTTP ${res.status}`

      // Persist error to DB
      await admin
        .from('channel_configs')
        .update({ last_error: errMsg, last_error_at: new Date().toISOString() })
        .eq('channel_type', 'whatsapp')
        .eq('label', 'Principal')

      return NextResponse.json({ success: false, error: errMsg })
    }

    // Clear last_error on success
    await admin
      .from('channel_configs')
      .update({ last_error: null, last_error_at: null })
      .eq('channel_type', 'whatsapp')
      .eq('label', 'Principal')

    return NextResponse.json({
      success: true,
      phone_number:   json.display_phone_number,
      verified_name:  json.verified_name,
      quality_rating: json.quality_rating,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error de red al contactar Meta'
    return NextResponse.json({ success: false, error: msg })
  }
}
