import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  console.log(`[Middleware] ${path}`)

  // Public routes
  const isPublic =
    path === '/login' ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.startsWith('/api/') ||
    path.startsWith('/embed/')

  if (isPublic) {
    console.log(`[Middleware] Public route, allowing`)
    return NextResponse.next()
  }

  // Check auth cookie
  const hasAuth = req.cookies.has('sb-access-token') || req.cookies.has('sb-refresh-token')
  console.log(`[Middleware] Has auth: ${hasAuth}`)

  if (!hasAuth) {
    console.log(`[Middleware] Redirecting to /login`)
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Logged in and accessing /login -> redirect to /leads
  if (hasAuth && path === '/login') {
    return NextResponse.redirect(new URL('/leads', req.url))
  }

  console.log(`[Middleware] Allowing request`)
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
