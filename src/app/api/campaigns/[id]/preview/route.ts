import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLeadsByFilters } from '@/lib/segment'
import type { SegmentFilters } from '@/types'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const adminSupabase = createAdminClient()
  const { data: campaign } = await adminSupabase
    .from('campaigns').select('filters').eq('id', id).single()

  const filters: SegmentFilters = campaign?.filters ?? {}
  const leads = await getLeadsByFilters(adminSupabase, filters)

  return NextResponse.json({ data: leads, count: leads.length })
}
