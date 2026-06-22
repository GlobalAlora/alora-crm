import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const workerUrl = process.env.BAILEYS_WORKER_URL
  const secret    = process.env.BAILEYS_WORKER_SECRET

  if (!workerUrl || !secret) {
    return NextResponse.json({ status: 'not_configured', qr: null })
  }

  try {
    const res = await fetch(`${workerUrl}/qr-data`, {
      headers: { 'x-webhook-secret': secret },
      signal: AbortSignal.timeout(8_000),
    })

    if (!res.ok) {
      return NextResponse.json({ status: 'error', qr: null, error: `Worker respondió ${res.status}` })
    }

    const data = await res.json() as { status: string; qr: string | null }
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al contactar el worker'
    return NextResponse.json({ status: 'error', qr: null, error: message })
  }
}
