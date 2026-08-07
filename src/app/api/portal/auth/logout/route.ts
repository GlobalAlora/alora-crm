import { NextRequest, NextResponse } from 'next/server'
import { deleteSession, PORTAL_COOKIE } from '@/lib/portal-auth'

export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get(PORTAL_COOKIE)?.value
  if (sessionId) {
    await deleteSession(sessionId).catch(() => {})
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set(PORTAL_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
