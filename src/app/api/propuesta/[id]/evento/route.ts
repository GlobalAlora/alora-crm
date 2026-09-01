import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { slugOrIdColumn } from '@/lib/propuesta-lookup'

type Params = { params: Promise<{ id: string }> }

const TIPOS = ['vista', 'aceptar', 'dudas', 'contacto'] as const

// Public, unauthenticated — la página pública de la propuesta llama acá para
// registrar una vista al cargar, y un click en "Aceptar"/"Tengo dudas".
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const tipo = body.tipo

  if (!TIPOS.includes(tipo)) {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: propuesta } = await admin
    .from('propuestas')
    .select('id')
    .eq(slugOrIdColumn(id), id)
    .single()

  if (!propuesta) return NextResponse.json({ error: 'Propuesta no encontrada' }, { status: 404 })

  const { error } = await admin.from('propuesta_eventos').insert({ propuesta_id: propuesta.id, tipo })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
