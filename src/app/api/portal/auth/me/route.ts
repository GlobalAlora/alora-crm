import { NextRequest, NextResponse } from 'next/server'
import { getPortalClient, PORTAL_COOKIE } from '@/lib/portal-auth'

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get(PORTAL_COOKIE)?.value
  if (!sessionId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const client = await getPortalClient(sessionId)
  if (!client) return NextResponse.json({ error: 'Sesión expirada' }, { status: 401 })

  return NextResponse.json({ data: client })
}
