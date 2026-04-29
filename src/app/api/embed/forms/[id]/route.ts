import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: form, error } = await admin
    .from('form_configs')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !form) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: totalLeads },
    { count: leads7d },
    { data: revenueRows },
    { data: events },
  ] = await Promise.all([
    admin.from('leads').select('id', { count: 'exact', head: true })
      .eq('form_id', id).is('deleted_at', null),
    admin.from('leads').select('id', { count: 'exact', head: true })
      .eq('form_id', id).is('deleted_at', null).gte('created_at', sevenDaysAgo),
    admin.from('leads').select('valor_propuesta_usd')
      .eq('form_id', id).is('deleted_at', null).not('valor_propuesta_usd', 'is', null),
    admin.from('embed_events').select('event_type, created_at')
      .eq('form_id', id).order('created_at', { ascending: false }),
  ])

  const revenue = (revenueRows ?? []).reduce((sum, r) => sum + (r.valor_propuesta_usd ?? 0), 0)
  const opened  = (events ?? []).filter(e => e.event_type === 'form_opened').length
  const started = (events ?? []).filter(e => e.event_type === 'form_started').length
  const submitted = (events ?? []).filter(e => e.event_type === 'form_submitted').length
  const abandoned = (events ?? []).filter(e => e.event_type === 'form_abandoned').length
  const convRate = started > 0 ? Math.round((submitted / started) * 100) : 0
  const abandRate = started > 0 ? Math.round((abandoned / started) * 100) : 0

  return NextResponse.json({
    data: {
      ...form,
      analytics: {
        total_leads: totalLeads ?? 0,
        leads_7d: leads7d ?? 0,
        revenue_usd: Math.round(revenue),
        opened,
        started,
        submitted,
        abandoned,
        conversion_rate: convRate,
        abandonment_rate: abandRate,
      },
    },
  })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('form_configs')
    .update({
      ...(body.name                !== undefined && { name: body.name }),
      ...(body.title               !== undefined && { title: body.title }),
      ...(body.subtitle            !== undefined && { subtitle: body.subtitle }),
      ...(body.color               !== undefined && { color: body.color }),
      ...(body.fields              !== undefined && { fields: body.fields }),
      ...(body.tags                !== undefined && { tags: body.tags }),
      ...(body.active              !== undefined && { active: body.active }),
      ...(body.success_title       !== undefined ? { success_title: body.success_title } : { success_title: null }),
      ...(body.success_message     !== undefined ? { success_message: body.success_message } : { success_message: null }),
      ...(body.success_redirect_url !== undefined ? { success_redirect_url: body.success_redirect_url } : { success_redirect_url: null }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, name, title, color, active, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('form_configs')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
