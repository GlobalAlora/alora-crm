import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// PATCH /api/pipeline-stages/reorder
// body: { ids: string[] }  — ordered list of stage IDs
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Solo admins' }, { status: 403 })

  const { ids } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids requerido' }, { status: 400 })
  }

  const admin = createAdminClient()
  await Promise.all(
    ids.map((id: string, index: number) =>
      admin.from('pipeline_stages').update({ order_position: index + 1 }).eq('id', id)
    )
  )

  return NextResponse.json({ success: true })
}
