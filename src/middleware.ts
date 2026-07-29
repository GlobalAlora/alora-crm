import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Paths que un usuario con rol Viewer puede visitar
const VIEWER_ALLOWED: string[] = ['/projects']

export async function middleware(req: NextRequest) {
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

  // ── Viewer role guard ───────────────────────────────────────────────
  // Viewers solo pueden acceder a /projects. Si intentan entrar a cualquier
  // otra ruta del CRM (dashboard, leads, whatsapp, etc.) los redirige.
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
