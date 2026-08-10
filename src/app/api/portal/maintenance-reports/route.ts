import { NextRequest, NextResponse } from 'next/server'
import { getPortalClient, PORTAL_COOKIE } from '@/lib/portal-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get(PORTAL_COOKIE)?.value
  if (!sessionId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const client = await getPortalClient(sessionId)
  if (!client) return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('maintenance_reports')
    .select('id, titulo, mes, contenido, archivo_url, archivo_nombre, created_at')
    .eq('client_id', client.id)
    .order('mes', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
