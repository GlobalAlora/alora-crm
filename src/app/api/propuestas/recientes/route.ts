import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Propuestas generadas con el Presupuestador (tienen contenido), más
// recientes primero — para poder retomarlas sin tener que rehacerlas.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const limit = Math.min(30, parseInt(req.nextUrl.searchParams.get('limit') || '15', 10))

  const { data, error } = await supabase
    .from('propuestas')
    .select('id, descripcion, contenido, created_at, lead:leads(id, nombre, apellido, empresa, estado_pipeline)')
    .not('contenido', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit * 2)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filtra propuestas guardadas antes del split detallada/resumen (formato
  // viejo, plano) -- el Presupuestador no las sabe previsualizar y con datos
  // en esa forma los componentes rompen al hacer .map() sobre algo que en
  // ese formato no existe. Mejor no ofrecerlas que crashear la pantalla.
  const valid = (data ?? []).filter((p) => Array.isArray((p.contenido as { detallada?: { bloques?: unknown } } | null)?.detallada?.bloques))

  return NextResponse.json({ data: valid.slice(0, limit) })
}
