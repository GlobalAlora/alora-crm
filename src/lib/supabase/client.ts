import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  console.log('[Supabase Client] URL exists:', !!url)
  console.log('[Supabase Client] KEY exists:', !!key)

  if (!url || !key) {
    throw new Error(`Missing Supabase env vars. URL: ${url}, KEY: ${key}`)
  }

  return createBrowserClient(url, key)
}
