import { createAdminClient } from '@/lib/supabase/admin'
import { sendGmail } from '@/lib/google-gmail'
import { parseLocalDate } from '@/lib/utils'

const FOOTER = `<p style="font-size:13px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:16px;margin:24px 0 0">
  Alora Digital · <a href="https://globalalora.com" style="color:#3b82f6">globalalora.com</a>
</p>`

export async function sendTaskAssignmentEmail(opts: {
  admin: ReturnType<typeof createAdminClient>
  assigneeId: string
  creatorId: string
  task: { titulo: string; descripcion: string | null; prioridad: string; fecha_limite: string | null; project_id: string }
}) {
  const { admin, assigneeId, creatorId, task } = opts

  // Never email someone who assigned the task to themselves
  if (assigneeId === creatorId) return

  const [{ data: assignee, error: assigneeErr }, { data: project, error: projectErr }] = await Promise.all([
    admin.from('users').select('email, full_name').eq('id', assigneeId).maybeSingle(),
    admin.from('projects').select('nombre').eq('id', task.project_id).maybeSingle(),
  ])

  console.log('[task-email] assignee:', JSON.stringify(assignee), 'err:', assigneeErr?.message)
  console.log('[task-email] project:', JSON.stringify(project), 'err:', projectErr?.message)

  let resolvedEmail = assignee?.email
  let resolvedName = assignee?.full_name
  if (!resolvedEmail) {
    const { data: authUser } = await admin.auth.admin.getUserById(assigneeId)
    resolvedEmail = authUser?.user?.email
    resolvedName = resolvedName ?? authUser?.user?.user_metadata?.full_name ?? authUser?.user?.email
    console.log('[task-email] auth.users fallback email:', resolvedEmail)
  }

  if (!resolvedEmail || !project?.nombre) {
    console.log('[task-email] SKIP — missing email or project name. assigneeId:', assigneeId, 'project_id:', task.project_id)
    return
  }

  console.log('[task-email] SENDING to:', resolvedEmail)
  await sendGmail({
    from:    'info@globalalora.com',
    to:      resolvedEmail,
    toName:  resolvedName,
    subject: `Nueva tarea asignada: ${task.titulo}`,
    html: buildTaskAssignedHtml({
      assigneeName: resolvedName ?? resolvedEmail,
      taskTitle:    task.titulo,
      projectName:  project.nombre,
      prioridad:    task.prioridad,
      descripcion:  task.descripcion,
      fechaLimite:  task.fecha_limite,
      projectUrl:   `https://alora-crm.vercel.app/projects/${task.project_id}`,
    }),
  })
}

const PRIORITY_LABEL: Record<string, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente',
}
const PRIORITY_COLOR: Record<string, string> = {
  urgente: '#ef4444', alta: '#f97316', media: '#3b82f6', baja: '#94a3b8',
}

export function buildTaskAssignedHtml(opts: {
  assigneeName: string
  taskTitle: string
  projectName: string
  prioridad: string
  descripcion?: string | null
  fechaLimite?: string | null
  projectUrl: string
}) {
  const prioColor = PRIORITY_COLOR[opts.prioridad] ?? '#94a3b8'
  const prioLabel = PRIORITY_LABEL[opts.prioridad] ?? opts.prioridad

  const fechaHtml = opts.fechaLimite
    ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;width:110px">Fecha límite</td><td style="font-size:13px;padding:4px 0">${parseLocalDate(opts.fechaLimite).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>`
    : ''

  const descHtml = opts.descripcion
    ? `<p style="font-size:14px;color:#475569;margin:16px 0 0;padding:12px;background:#f8fafc;border-radius:8px;line-height:1.6">${opts.descripcion}</p>`
    : ''

  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#1e293b;padding:24px 32px;border-radius:12px 12px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">Nueva tarea asignada</h2>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px">${opts.projectName}</p>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px">
    <p style="font-size:14px;color:#475569;margin:0 0 20px">Hola <strong>${opts.assigneeName}</strong>, te asignaron una nueva tarea:</p>

    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:20px">
      <p style="font-size:17px;font-weight:600;color:#0f172a;margin:0 0 12px">${opts.taskTitle}</p>
      <table style="border-collapse:collapse;width:100%">
        <tr>
          <td style="color:#64748b;font-size:13px;padding:4px 0;width:110px">Proyecto</td>
          <td style="font-size:13px;padding:4px 0">${opts.projectName}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-size:13px;padding:4px 0">Prioridad</td>
          <td style="font-size:13px;padding:4px 0"><span style="color:${prioColor};font-weight:600">${prioLabel}</span></td>
        </tr>
        ${fechaHtml}
      </table>
      ${descHtml}
    </div>

    <a href="${opts.projectUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500">
      Ver tarea →
    </a>

    ${FOOTER}
  </div>
</div>`
}
