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
    // First, let's test the token permissions
    const tokenTestUrl = `https://graph.facebook.com/v18.0/me?fields=id,name`
    const tokenRes = await fetch(tokenTestUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    })

    if (!tokenRes.ok) {
      const tokenError = await tokenRes.json() as Record<string, unknown>
      return NextResponse.json({ 
        success: false, 
        error: `Token inválido o sin permisos: ${(tokenError?.error as Record<string, unknown>)?.message ?? 'Token error'}`,
        debug: { step: 'token_validation', error: tokenError?.error }
      })
    }

    // Try with v18.0 first (more stable for test numbers)
    let apiUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,name_status`
    
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    })

    const json = await res.json() as Record<string, unknown>

    if (!res.ok) {
      const error = json?.error as Record<string, unknown>
      const errMsg = error?.message as string
        ?? `HTTP ${res.status}`
      
      // Add more debugging info
      const debugInfo = {
        phone_number_id: phoneNumberId,
        api_version: 'v18.0',
        error_code: error?.code,
        error_type: error?.type,
        full_error: error
      }

      // Try with v19.0 as fallback
      if (res.status === 404) {
        try {
          const v19Res = await fetch(
            `https://graph.facebook.com/v19.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: AbortSignal.timeout(8_000),
            }
          )
          
          if (v19Res.ok) {
            const v19Json = await v19Res.json() as Record<string, unknown>
            await admin
              .from('channel_configs')
              .update({ last_error: null, last_error_at: null })
              .eq('channel_type', 'whatsapp')
              .eq('label', 'Principal')

            return NextResponse.json({
              success: true,
              phone_number:   v19Json.display_phone_number,
              verified_name:  v19Json.verified_name,
              quality_rating: v19Json.quality_rating,
            })
          }
        } catch (fallbackError) {
          // Continue with original error
        }
      }

      // Persist error to DB
      await admin
        .from('channel_configs')
        .update({ 
          last_error: `${errMsg} (Debug: ${JSON.stringify(debugInfo)})`, 
          last_error_at: new Date().toISOString() 
        })
        .eq('channel_type', 'whatsapp')
        .eq('label', 'Principal')

      return NextResponse.json({ 
        success: false, 
        error: errMsg,
        debug: debugInfo
      })
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
