import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()

  const [emailsRes, tasksRes] = await Promise.all([
    // Unread inbound emails (shared inbox, visible to all)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('activities')
      .select('id, lead_id, descripcion, metadata, created_at, leads(id, nombre, apellido, empresa)')
      .eq('tipo', 'email')
      .is('read_at', null)
      .eq('metadata->>direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(20),

    // Task assignment notifications for this user
    admin
      .from('task_notifications')
      .select('id, task_id, project_id, task_titulo, project_nombre, created_at')
      .eq('user_id', user.id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const emails = (emailsRes.data ?? []).map((n: Record<string, unknown>) => ({ ...n, _type: 'email' as const }))
  const tasks  = (tasksRes.data  ?? []).map((n: Record<string, unknown>) => ({ ...n, _type: 'task'  as const }))

  // Merge and sort by created_at desc
  const all = [...emails, ...tasks].sort(
    (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
  )

  return NextResponse.json({ data: all })
}
