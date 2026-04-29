import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  console.log(`[Middleware] ${path}`)
  console.log(`[Middleware] Cookies:`, req.cookies.getAll().map(c => c.name))

  // Public routes
  const isPublic =
    path === '/login' ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.startsWith('/api/') ||
    path.startsWith('/embed/') ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css')

  if (isPublic) {
    console.log(`[Middleware] Public route, allowing`)
    return NextResponse.next()
  }

  // Check for any Supabase auth cookie (pattern: sb-{project-ref}-auth-token or similar)
  const cookies = req.cookies.getAll()
  const hasAuth = cookies.some(c => c.name.startsWith('sb-') && (c.name.includes('auth') || c.name.includes('token')))
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
