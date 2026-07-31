import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('activities')
    .select('id, created_at, lead_id, metadata, descripcion')
    .like('descripcion', '[portfolio-match]%')
    .order('created_at', { ascending: false })
    .limit(500)

  if (!rows?.length) return NextResponse.json({ totals: [], recent: [] })

  // Aggregate totals per case
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const name = (r.metadata as { portfolio_case?: string })?.portfolio_case ?? 'Desconocido'
    counts[name] = (counts[name] ?? 0) + 1
  }
  const totals = Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  // Fetch lead names for the 20 most recent
  const recent20 = rows.slice(0, 20)
  const leadIds  = [...new Set(recent20.map(r => r.lead_id).filter(Boolean))] as string[]
  let leadMap: Record<string, { nombre: string | null; apellido: string | null }> = {}
  if (leadIds.length) {
    const { data: leads } = await admin.from('leads').select('id, nombre, apellido').in('id', leadIds)
    leadMap = Object.fromEntries((leads ?? []).map(l => [l.id, l]))
  }

  const recent = recent20.map(r => {
    const meta = r.metadata as { portfolio_case?: string; phase?: string; text?: string } | null
    const lead = r.lead_id ? leadMap[r.lead_id] : null
    return {
      id:         r.id,
      created_at: r.created_at,
      case_name:  meta?.portfolio_case ?? '—',
      phase:      meta?.phase ?? '—',
      text:       meta?.text ?? '',
      lead_name:  lead ? [lead.nombre, lead.apellido].filter(Boolean).join(' ') : null,
      lead_id:    r.lead_id,
    }
  })

  return NextResponse.json({ totals, recent })
}
