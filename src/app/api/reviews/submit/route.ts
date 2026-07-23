import { NextRequest, NextResponse } from 'next/server'
import { sendNewReviewAlert } from '@/lib/review-alerts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400, headers: CORS_HEADERS })
  }

  if (!body.nombre?.trim()) {
    return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400, headers: CORS_HEADERS })
  }

  const resena = typeof body.resena === 'string' ? body.resena.trim() : ''
  if (resena.length < 20) {
    return NextResponse.json({ error: 'La reseña es demasiado corta' }, { status: 400, headers: CORS_HEADERS })
  }

  const rating = Number(body.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Calificación inválida' }, { status: 400, headers: CORS_HEADERS })
  }

  // Best-effort, awaited so the alert has actually gone out before Vercel
  // can freeze the function post-response (see leads alert for the same
  // reasoning).
  await sendNewReviewAlert({
    nombre: body.nombre.trim(),
    empresa: body.empresa?.trim() || null,
    rating,
    resena,
    locale: body.locale === 'en' ? 'en' : 'es',
  })

  return NextResponse.json({ ok: true }, { status: 201, headers: CORS_HEADERS })
}
