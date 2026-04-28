import { NextResponse, type NextRequest } from 'next/server'

// Simple auth check using cookie presence
// Full auth validation happens in client/components
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // Public routes - no auth needed
  const isPublicRoute =
    path === '/login' ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.startsWith('/embed') ||
    path.startsWith('/api/webhooks') ||
    path.startsWith('/api/embed')

  if (isPublicRoute) {
    return NextResponse.next()
  }

  // Check for auth cookie (sb-access-token or sb-refresh-token)
  const hasAuthCookie = req.cookies.has('sb-access-token') || req.cookies.has('sb-refresh-token')

  const isLoginRoute = path === '/login'
  const isApiRoute = path.startsWith('/api')

  if (!hasAuthCookie && !isLoginRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', path)
    return NextResponse.redirect(url)
  }

  if (hasAuthCookie && isLoginRoute) {
    const url = req.nextUrl.clone()
    url.pathname = '/leads'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\.ico).*)'],
}
