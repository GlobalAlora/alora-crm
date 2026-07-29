const FOOTER = `<p style="font-size:13px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:16px;margin:24px 0 0">
  Alora Digital · <a href="https://globalalora.com" style="color:#3b82f6">globalalora.com</a>
</p>`

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
    ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;width:110px">Fecha límite</td><td style="font-size:13px;padding:4px 0">${new Date(opts.fechaLimite).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>`
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
