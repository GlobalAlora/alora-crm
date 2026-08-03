import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export async function createTaskNotification(
  admin: AdminClient,
  opts: {
    userId:    string
    taskId:    string
    projectId: string
    taskTitulo: string
  },
) {
  const { data: project } = await admin
    .from('projects')
    .select('nombre')
    .eq('id', opts.projectId)
    .maybeSingle()

  await admin.from('task_notifications').insert({
    user_id:        opts.userId,
    task_id:        opts.taskId,
    project_id:     opts.projectId,
    task_titulo:    opts.taskTitulo,
    project_nombre: project?.nombre ?? null,
  })
}
