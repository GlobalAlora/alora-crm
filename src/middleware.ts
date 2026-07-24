import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const path     = req.nextUrl.pathname
  const hostname = req.headers.get('host') ?? ''

  // ── Subdomain: ticket.globalalora.com → rewrite to /ticket-portal ──
  const isPortalDomain =
    hostname === 'ticket.globalalora.com' ||
    hostname.startsWith('ticket.globalalora.com:')

  if (isPortalDomain) {
    // Pass through: API, Next.js internals, and anything with an extension
    // (.json, .ico, .png, .js, .css, .svg, .webp …)
    if (
      path.startsWith('/api/') ||
      path.startsWith('/_next/') ||
      path.startsWith('/ticket-portal') ||
      path.includes('.')
    ) {
      return NextResponse.next()
    }

    // Rewrite clean paths to the portal route group
    // /         → /ticket-portal          (submission form)
    // /<token>  → /ticket-portal/<token>  (tracking page)
    const url = req.nextUrl.clone()
    url.pathname = path === '/' ? '/ticket-portal' : `/ticket-portal${path}`
    return NextResponse.rewrite(url)
  }

  // ── CRM auth guard ──────────────────────────────────────────────────

  const isPublic =
    path === '/login' ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.startsWith('/api/') ||
    path.startsWith('/embed/') ||
    path.startsWith('/ticket-portal') ||
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css')

  if (isPublic) return NextResponse.next()

  const cookies = req.cookies.getAll()
  const hasAuth = cookies.some(
    c => c.name.startsWith('sb-') && (c.name.includes('auth') || c.name.includes('token'))
  )

  if (!hasAuth) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (hasAuth && path === '/login') {
    return NextResponse.redirect(new URL('/leads', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
