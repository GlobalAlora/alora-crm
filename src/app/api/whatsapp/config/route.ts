import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Mask token: show only last 4 chars
function maskToken(token: string | null | undefined): string {
  if (!token) return ''
  if (token.length <= 4) return '••••'
  return `••••••••${token.slice(-4)}`
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('channel_configs')
    .select('id, channel_type, label, phone_number_id, business_account_id, verify_token, webhook_url, is_active, last_message_at, last_error, last_error_at, created_at, updated_at, access_token')
    .eq('channel_type', 'whatsapp')
    .eq('label', 'Principal')
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fall back to env vars if no DB row exists
  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const envToken   = process.env.WHATSAPP_ACCESS_TOKEN
  const envVerify  = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

  const webhookUrl = `${appUrl}/api/webhooks/whatsapp`

  return NextResponse.json({
    config: {
      id:                  data?.id ?? null,
      channel_type:        'whatsapp',
      label:               'Principal',
      phone_number_id:     data?.phone_number_id     ?? envPhoneId  ?? '',
      business_account_id: data?.business_account_id ?? '',
      // Never expose raw token — show masked version
      access_token_masked: maskToken(data?.access_token ?? envToken),
      has_token:           !!(data?.access_token ?? envToken),
      verify_token:        data?.verify_token ?? envVerify ?? '',
      webhook_url:         webhookUrl,
      is_active:           data?.is_active ?? true,
      last_message_at:     data?.last_message_at ?? null,
      last_error:          data?.last_error ?? null,
      last_error_at:       data?.last_error_at ?? null,
    }
  })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as {
    phone_number_id?: string
    business_account_id?: string
    access_token?: string
    verify_token?: string
  }

  const updates: Record<string, unknown> = {
    channel_type:        'whatsapp',
    label:               'Principal',
    phone_number_id:     body.phone_number_id?.trim()     || null,
    business_account_id: body.business_account_id?.trim() || null,
    verify_token:        body.verify_token?.trim()        || null,
  }

  // Only update token if a new non-masked value was provided
  if (body.access_token && !body.access_token.startsWith('••••')) {
    updates.access_token = body.access_token.trim()
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('channel_configs')
    .upsert(updates, { onConflict: 'channel_type,label' })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: data?.id })
}
