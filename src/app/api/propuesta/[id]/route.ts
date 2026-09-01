import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { slugOrIdColumn } from '@/lib/propuesta-lookup'

type Params = { params: Promise<{ id: string }> }

// Public, unauthenticated — this is the data behind the link sent to the client.
// contenido holds both { detallada, resumen } — the public page picks which to show.
// [id] can be the real UUID or the readable slug.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('propuestas')
    .select('id, contenido')
    .eq(slugOrIdColumn(id), id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Propuesta no encontrada' }, { status: 404 })
  if (!data.contenido?.detallada) return NextResponse.json({ error: 'Esta propuesta no tiene un diseño generado' }, { status: 404 })

  return NextResponse.json({ data })
}
