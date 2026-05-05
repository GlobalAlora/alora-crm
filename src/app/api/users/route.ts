import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.log('Users API: No authenticated user')
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, avatar_url, role')
      .in('role', ['admin', 'sales'])
      .order('full_name')

    if (error) {
      console.error('Users API error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('Users API: Found', data?.length || 0, 'users')
    return NextResponse.json({ data })
  } catch (err) {
    console.error('Users API unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 }
    )
  }
}
