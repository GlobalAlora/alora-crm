import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('team_members')
      .select('id, full_name, role, email, created_at')
      .order('full_name')

    if (error) {
      console.error('[team-members GET]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[team-members GET] unexpected', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const { full_name, role, email } = body as { full_name: string; role: string; email?: string }

    if (!full_name?.trim()) {
      return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('team_members')
      .insert({ full_name: full_name.trim(), role: role?.trim() || 'dev', email: email?.trim() || null })
      .select()
      .single()

    if (error) {
      console.error('[team-members POST]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('[team-members POST] unexpected', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
