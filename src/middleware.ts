import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const path     = req.nextUrl.pathname
  const hostname = req.headers.get('host') ?? ''

  // ── Subdomain: ticket.globalalora.com → rewrite to /ticket-portal ──
  const isPortalDomain =
    hostname === 'ticket.globalalora.com' ||
    hostname.startsWith('ticket.globalalora.com:')

  if (isPortalDomain) {
    // API calls, static assets and Next.js internals pass through unchanged
    if (
      path.startsWith('/api/') ||
      path.startsWith('/_next/') ||
      path.startsWith('/favicon') ||
      path.startsWith('/ticket-portal')  // already correct path (dev access)
    ) {
      return NextResponse.next()
    }

    // / → /ticket-portal (form)
    // /abc123token → /ticket-portal/abc123token (tracking page)
    // /login or anything else → redirect to portal root
    const validPortalPath = /^\/[a-zA-Z0-9_-]+$/.test(path)
    if (path === '/' || validPortalPath) {
      const url = req.nextUrl.clone()
      url.pathname = path === '/' ? '/ticket-portal' : `/ticket-portal${path}`
      return NextResponse.rewrite(url)
    }

    // Unknown path on portal domain → redirect to portal home
    return NextResponse.redirect(new URL('/', req.url))
  }

  // ── CRM auth guard ──────────────────────────────────────────────────

  const isPublic =
    path === '/login' ||
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.startsWith('/api/') ||
    path.startsWith('/embed/') ||
    path.startsWith('/ticket-portal') ||   // portal público (dev access via path)
    path.endsWith('.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css')

  if (isPublic) return NextResponse.next()

  const cookies = req.cookies.getAll()
  const hasAuth = cookies.some(c => c.name.startsWith('sb-') && (c.name.includes('auth') || c.name.includes('token')))

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
