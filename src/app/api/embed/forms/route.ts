import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const sevenDaysAgo = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const { data: forms, error } = await admin
    .from('form_configs')
    .select('id, name, title, color, active, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Parallel analytics per form
  const formsWithStats = await Promise.all(
    (forms ?? []).map(async (form) => {
      const [
        { count: totalLeads },
        { count: leads7d },
        { data: events },
      ] = await Promise.all([
        admin.from('leads').select('id', { count: 'exact', head: true })
          .eq('form_id', form.id).is('deleted_at', null),
        admin.from('leads').select('id', { count: 'exact', head: true })
          .eq('form_id', form.id).is('deleted_at', null).gte('created_at', sevenDaysAgo()),
        admin.from('embed_events').select('event_type')
          .eq('form_id', form.id)
          .in('event_type', ['form_started', 'form_submitted', 'form_opened']),
      ])

      const opened   = (events ?? []).filter(e => e.event_type === 'form_opened').length
      const started  = (events ?? []).filter(e => e.event_type === 'form_started').length
      const submitted = (events ?? []).filter(e => e.event_type === 'form_submitted').length
      const convRate = started > 0 ? Math.round((submitted / started) * 100) : 0

      return {
        ...form,
        stats: {
          total_leads: totalLeads ?? 0,
          leads_7d: leads7d ?? 0,
          opened,
          started,
          submitted,
          conversion_rate: convRate,
        },
      }
    })
  )

  return NextResponse.json({ data: formsWithStats })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: 'name es requerido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('form_configs')
    .insert({
      name: body.name.trim(),
      title: body.title ?? '¿Hablamos?',
      subtitle: body.subtitle ?? 'Completá el formulario y te contactamos en 24hs.',
      color: body.color ?? '#2563eb',
      fields: body.fields ?? [],
      tags: body.tags ?? [],
      active: true,
    })
    .select('id, name, title, color, active, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
