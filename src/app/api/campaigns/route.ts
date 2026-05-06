import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const adminSupabase = createAdminClient()
  const { data, error } = await adminSupabase
    .from('campaigns')
    .select('*, recipient_count:campaign_recipients(count)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const campaigns = (data ?? []).map((c) => ({
    ...c,
    recipient_count: Array.isArray(c.recipient_count) ? c.recipient_count[0]?.count ?? 0 : 0,
  }))

  return NextResponse.json({ data: campaigns })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  if (!body.name?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  if (!body.subject?.trim()) return NextResponse.json({ error: 'Asunto requerido' }, { status: 400 })
  if (!body.body?.trim()) return NextResponse.json({ error: 'Cuerpo requerido' }, { status: 400 })

  const adminSupabase = createAdminClient()
  const { data, error } = await adminSupabase
    .from('campaigns')
    .insert({
      name: body.name.trim(),
      subject: body.subject.trim(),
      body: body.body.trim(),
      from_name: body.from_name || 'Alora CRM',
      from_email: body.from_email || 'noreply@globalalora.com',
      filters: body.filters || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
