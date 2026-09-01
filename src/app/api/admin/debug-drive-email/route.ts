import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// TEMPORARY — remove after use. Lets a logged-in team member read the
// service account email from Vercel's env (marked Secret, so it can't be
// viewed in the dashboard) to share the "Meet Recordings" Drive folder with it.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  return NextResponse.json({ email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null })
}
