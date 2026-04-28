import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // Static files y rutas públicas excluidas
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

  // Check env vars exist
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars')
    // Allow through but log error - will fail gracefully in components
    return NextResponse.next()
  }

  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
        res = NextResponse.next({ request: req })
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options)
        )
      },
    },
  })

  // Refresh session
  const { data: { user } } = await supabase.auth.getUser()

  const isLoginRoute = path === '/login'
  const isApiRoute = path.startsWith('/api')

  if (!user && !isLoginRoute) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isLoginRoute) {
    const url = req.nextUrl.clone()
    url.pathname = '/leads'
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\.ico).*)'],
}
