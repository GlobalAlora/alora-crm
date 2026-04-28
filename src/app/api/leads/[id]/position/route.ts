import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { kanban_position, updated_at } = await req.json()

  if (kanban_position === undefined || kanban_position === null) {
    return NextResponse.json({ error: 'kanban_position es requerido' }, { status: 400 })
  }

  if (!updated_at) {
    return NextResponse.json({ error: 'updated_at es requerido para control de concurrencia' }, { status: 400 })
  }

  // Optimistic concurrency check
  const { data: current } = await supabase
    .from('leads')
    .select('updated_at')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!current) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })

  // Compare timestamps (allow 1s tolerance for clock drift)
  const serverTs = new Date(current.updated_at).getTime()
  const clientTs = new Date(updated_at).getTime()
  if (Math.abs(serverTs - clientTs) > 1000) {
    return NextResponse.json(
      { error: 'El lead fue modificado por otro usuario. Recargá el tablero.' },
      { status: 409 }
    )
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('leads')
    .update({ kanban_position, updated_at: now })
    .eq('id', id)
    .select('id, kanban_position, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}
