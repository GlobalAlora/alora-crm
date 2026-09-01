import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

// Authenticated — resumen de actividad de una propuesta ya guardada: cuántas
// veces se abrió el link público, cuándo fue la última vez, y si el cliente
// clickeó "Aceptar" o "Tengo dudas".
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('propuesta_eventos')
    .select('tipo, created_at')
    .eq('propuesta_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const vistas = data.filter((e) => e.tipo === 'vista')
  const acepto = data.find((e) => e.tipo === 'aceptar')
  const dudas = data.find((e) => e.tipo === 'dudas')
  const contacto = data.find((e) => e.tipo === 'contacto')

  return NextResponse.json({
    data: {
      vistas: vistas.length,
      ultima_vista: vistas[0]?.created_at ?? null,
      acepto: acepto?.created_at ?? null,
      dudas: dudas?.created_at ?? null,
      contacto: contacto?.created_at ?? null,
    },
  })
}
