import { NextRequest, NextResponse } from 'next/server'
import { getPortalClient, PORTAL_COOKIE } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get(PORTAL_COOKIE)?.value
  if (!sessionId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const client = await getPortalClient(sessionId)
  if (!client) return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 })

  const admin = createAdminClient()
  const { data: tickets } = await admin
    .from('tickets')
    .select('id, numero, titulo, descripcion, estado, prioridad, categoria, created_at, resolved_at, ticket_token, horas_estimadas, horas_reales, attachments')
    .eq('client_email', client.email)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return NextResponse.json({ data: tickets ?? [] })
}
