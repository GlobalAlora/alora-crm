import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getLeadsByFilters } from '@/lib/segment'
import type { SegmentFilters } from '@/types'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const filters: SegmentFilters = await req.json()

  try {
    const leads = await getLeadsByFilters(supabase, filters)
    return NextResponse.json({ data: leads, count: leads.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error en segmentación'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
