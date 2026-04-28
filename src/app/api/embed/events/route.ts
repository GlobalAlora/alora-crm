import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_EVENTS = ['form_opened', 'form_started', 'form_submitted', 'form_abandoned'] as const
type EventType = (typeof VALID_EVENTS)[number]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>

  // Accept both JSON (fetch) and Blob (sendBeacon)
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json') || ct.includes('text/plain')) {
    body = await req.json().catch(() => ({}))
  } else {
    const text = await req.text().catch(() => '{}')
    body = JSON.parse(text)
  }

  const { form_id, event_type, session_id, metadata } = body as {
    form_id?: string
    event_type?: string
    session_id?: string
    metadata?: Record<string, unknown>
  }

  if (!form_id || !event_type) {
    return NextResponse.json({ error: 'form_id y event_type son requeridos' }, { status: 400, headers: CORS })
  }

  if (!VALID_EVENTS.includes(event_type as EventType)) {
    return NextResponse.json({ error: 'event_type inválido' }, { status: 400, headers: CORS })
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('embed_events').insert({
    form_id,
    event_type,
    session_id: session_id ?? null,
    metadata: metadata ?? {},
  })

  if (error) {
    // Silently accept if table doesn't exist yet (migration pending)
    if (error.code === '42P01') {
      return NextResponse.json({ ok: true }, { headers: CORS })
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS })
  }

  return NextResponse.json({ ok: true }, { headers: CORS })
}
