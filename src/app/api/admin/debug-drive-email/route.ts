import { NextResponse } from 'next/server'

// TEMPORARY — remove after use. Reads the service account email from
// Vercel's env (marked Secret, so it can't be viewed in the dashboard) to
// share the "Meet Recordings" Drive folder with it.
export async function GET() {
  return NextResponse.json({ email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null })
}
