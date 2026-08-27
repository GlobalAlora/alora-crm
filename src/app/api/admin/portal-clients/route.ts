import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPassword } from '@/lib/portal-auth'
import { Resend } from 'resend'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', status: 401 as const }
  const admin = createAdminClient()
  const { data } = await admin.from('users').select('role').eq('id', user.id).maybeSingle()
  if (data?.role !== 'admin') return { error: 'Solo administradores', status: 403 as const }
  return { admin }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin } = auth

  const { data: clients, error } = await admin
    .from('portal_clients')
    .select('id, email, nombre, empresa, plan_horas_mensual, color_acento, nombre_plan, mensaje_bienvenida, logo_url, manager_nombre, manager_avatar, project_id, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!clients?.length) return NextResponse.json({ data: [] })

  const emails = clients.map(c => c.email)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  // Fetch tickets for all portal clients
  const [{ data: allTickets }, { data: resolvedTickets }, { data: openTickets }] = await Promise.all([
    admin
      .from('tickets')
      .select('client_email, estado')
      .in('client_email', emails)
      .is('deleted_at', null),
    // Resolved: use created_at as fallback when resolved_at is null
    admin
      .from('tickets')
      .select('client_email, horas_reales')
      .in('client_email', emails)
      .in('estado', ['resuelto', 'cerrado'])
      .or(`and(resolved_at.gte.${monthStart},resolved_at.lt.${monthEnd}),and(resolved_at.is.null,created_at.gte.${monthStart},created_at.lt.${monthEnd})`)
      .is('deleted_at', null),
    // Open with hours (approved or pending estimation)
    admin
      .from('tickets')
      .select('client_email, horas_estimadas, horas_reales, horas_aprobadas')
      .in('client_email', emails)
      .not('estado', 'in', '("resuelto","cerrado")')
      .not('horas_estimadas', 'is', null)
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd)
      .is('deleted_at', null),
  ])

  // Aggregate per email
  const openByEmail: Record<string, number> = {}
  const totalByEmail: Record<string, number> = {}
  for (const t of allTickets ?? []) {
    if (!t.client_email) continue
    totalByEmail[t.client_email] = (totalByEmail[t.client_email] ?? 0) + 1
    if (!['resuelto', 'cerrado'].includes(t.estado)) {
      openByEmail[t.client_email] = (openByEmail[t.client_email] ?? 0) + 1
    }
  }

  const horasByEmail: Record<string, number> = {}
  for (const t of resolvedTickets ?? []) {
    if (!t.client_email) continue
    horasByEmail[t.client_email] = (horasByEmail[t.client_email] ?? 0) + (Number(t.horas_reales) || 0)
  }
  for (const t of openTickets ?? []) {
    if (!t.client_email) continue
    const hs = t.horas_reales != null
      ? Number(t.horas_reales)
      : t.horas_aprobadas
        ? Number(t.horas_estimadas)
        : 0
    horasByEmail[t.client_email] = (horasByEmail[t.client_email] ?? 0) + hs
  }

  const data = clients.map(c => {
    const horas_mes  = horasByEmail[c.email] ?? 0
    const horas_extra = Math.max(0, horas_mes - (c.plan_horas_mensual || 0))
    return {
      ...c,
      tickets_abiertos: openByEmail[c.email] ?? 0,
      tickets_total:    totalByEmail[c.email] ?? 0,
      horas_mes,
      horas_extra,
    }
  })

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { admin } = auth

  const { email, password, nombre, empresa, plan_horas_mensual } = await req.json()

  if (!email?.trim() || !password || !nombre?.trim()) {
    return NextResponse.json({ error: 'Email, contraseña y nombre son requeridos' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Contraseña mínimo 8 caracteres' }, { status: 400 })
  }

  const { data: existing } = await admin
    .from('portal_clients')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Ya existe una cuenta con ese email' }, { status: 409 })

  const passwordHash = await hashPassword(password)

  const { data: client, error } = await admin
    .from('portal_clients')
    .insert({
      email:              email.toLowerCase().trim(),
      password_hash:      passwordHash,
      nombre:             nombre.trim(),
      empresa:            empresa?.trim() || null,
      plan_horas_mensual: Number(plan_horas_mensual) || 20,
    })
    .select('id, email, nombre, empresa, plan_horas_mensual, color_acento, nombre_plan, mensaje_bienvenida, logo_url, manager_nombre, manager_avatar, project_id, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send welcome email (fire-and-forget — never block the response)
  sendWelcomeEmail({
    to:       client.email,
    nombre:   client.nombre,
    empresa:  client.empresa,
    password,
  }).catch(err => console.error('[portal-clients] welcome email failed:', err))

  return NextResponse.json({ data: { ...client, tickets_abiertos: 0, tickets_total: 0, horas_mes: 0 } }, { status: 201 })
}

async function sendWelcomeEmail({
  to, nombre, empresa, password,
}: { to: string; nombre: string; empresa: string | null; password: string }) {
  if (!process.env.RESEND_API_KEY) return
  const resend = new Resend(process.env.RESEND_API_KEY)
  const portalUrl = 'https://ticket.globalalora.com'

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr><td style="background:#0f172a;padding:28px 32px;">
          <img src="https://alora-crm.vercel.app/logo-nav-white.png" alt="Alora" height="28" style="display:block;">
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">¡Hola, ${nombre}!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#475569;">
            ${empresa ? `Desde <strong>${empresa}</strong>, ya ` : 'Ya '}podés acceder a tu portal de soporte para ver el estado de tus tickets y horas de servicio.
          </p>

          <!-- Credentials box -->
          <div style="background:#f1f5f9;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
            <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;">Tus credenciales de acceso</p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;width:90px;">Usuario</td>
                <td style="padding:6px 0;font-size:14px;font-weight:600;color:#0f172a;font-family:monospace;">${to}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#64748b;">Contraseña</td>
                <td style="padding:6px 0;font-size:14px;font-weight:600;color:#0f172a;font-family:monospace;">${password}</td>
              </tr>
            </table>
          </div>

          <!-- CTA -->
          <div style="text-align:center;margin-bottom:28px;">
            <a href="${portalUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;">
              Ingresar al portal →
            </a>
          </div>

          <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;">
            Guardá este email: contiene tus credenciales de acceso.<br>
            Si tenés alguna duda, respondé este correo y te ayudamos.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="border-top:1px solid #f1f5f9;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#cbd5e1;">Alora · globalalora.com</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  await resend.emails.send({
    from:    'Alora <noreply@globalalora.com>',
    to:      [to],
    replyTo: 'hola@globalalora.com',
    subject: `Tu acceso al portal de soporte${empresa ? ` · ${empresa}` : ''}`,
    html,
  })
}
