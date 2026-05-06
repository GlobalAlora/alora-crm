import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json()
  const { full_name, role, email } = body as { full_name?: string; role?: string; email?: string | null }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('team_members')
    .update({
      ...(full_name !== undefined && { full_name: full_name.trim() }),
      ...(role !== undefined && { role: role.trim() }),
      ...(email !== undefined && { email: email?.trim() || null }),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('team_members').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
