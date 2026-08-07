import { NextRequest, NextResponse } from 'next/server'
import { getPortalClient, PORTAL_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/portal-auth'

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session')
  if (!sessionId) return NextResponse.redirect(new URL('/login', req.url))

  const client = await getPortalClient(sessionId)
  if (!client) return NextResponse.redirect(new URL('/login', req.url))

  const res = NextResponse.redirect(new URL('/dashboard', req.url))
  res.cookies.set(PORTAL_COOKIE, sessionId, SESSION_COOKIE_OPTIONS)
  return res
}
