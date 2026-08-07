import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Paths que un usuario con rol Viewer puede visitar
const VIEWER_ALLOWED: string[] = ['/projects']

export async function proxy(req: NextRequest) {
  const path     = req.nextUrl.pathname
  const hostname = req.headers.get('host') ?? ''

  // ── Subdomain: ticket.globalalora.com → rewrite to /ticket-portal ──
  const isPortalDomain =
    hostname === 'ticket.globalalora.com' ||
    hostname.startsWith('ticket.globalalora.com:')

  if (isPortalDomain) {
    // Pass through: API, Next.js internals, static assets (.json, .ico, .png, .js, .css …)
    if (
      path.startsWith('/api/') ||
      path.startsWith('/_next/') ||
      path.startsWith('/ticket-portal') ||
      path.includes('.')
    ) {
      return NextResponse.next()
    }

    const hasSession = req.cookies.has('portal_session')

    // Root → redirect based on auth state
    if (path === '/') {
      const url = req.nextUrl.clone()
      url.pathname = hasSession ? '/dashboard' : '/login'
      return NextResponse.redirect(url)
    }

    // Protected routes: require session
    const PROTECTED = ['/dashboard', '/nuevo']
    if (PROTECTED.includes(path) && !hasSession) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    // Login page → redirect if already authenticated
    if (path === '/login' && hasSession) {
      const url = req.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    // Rewrite all portal paths to /ticket-portal/*
    // /login      → /ticket-portal/login
    // /dashboard  → /ticket-portal/dashboard
    // /nuevo      → /ticket-portal/nuevo
    // /<token>    → /ticket-portal/<token>
    const url = req.nextUrl.clone()
    url.pathname = `/ticket-portal${path}`
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

  // ── Viewer role guard ───────────────────────────────────────────────
  const response = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role === 'viewer') {
      const allowed = VIEWER_ALLOWED.some(prefix => path.startsWith(prefix))
      if (!allowed) {
        return NextResponse.redirect(new URL('/projects', req.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
