import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

// Public, unauthenticated — this is the data behind the link sent to the client.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('propuestas')
    .select('id, contenido')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Propuesta no encontrada' }, { status: 404 })
  if (!data.contenido) return NextResponse.json({ error: 'Esta propuesta no tiene un diseño generado' }, { status: 404 })

  return NextResponse.json({ data })
}
