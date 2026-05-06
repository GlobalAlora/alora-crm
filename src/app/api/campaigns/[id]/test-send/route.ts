import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

type Params = { params: Promise<{ id: string }> }

const SAMPLE_LEAD = {
  nombre: 'Juan',
  apellido: 'García',
  email: '',
  empresa: 'ACME SA',
}

function interpolate(
  template: string,
  lead: { nombre: string; apellido: string | null; email: string | null; empresa?: string | null }
): string {
  const nombre = [lead.nombre, lead.apellido].filter(Boolean).join(' ')
  return template
    .replace(/\{\{nombre\}\}/gi, nombre)
    .replace(/\{\{email\}\}/gi, lead.email ?? '')
    .replace(/\{\{empresa\}\}/gi, lead.empresa ?? '')
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { email, leadId } = body as { email?: string; leadId?: string }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY no configurado' }, { status: 500 })
  }

  // Resolve lead data for variable interpolation
  let leadData = { ...SAMPLE_LEAD, email }

  if (leadId) {
    const adminSupabase = createAdminClient()
    const { data: lead } = await adminSupabase
      .from('leads')
      .select('nombre, apellido, email, empresa')
      .eq('id', leadId)
      .single()

    if (lead) {
      leadData = {
        nombre: lead.nombre ?? 'Juan',
        apellido: lead.apellido ?? null,
        email, // always send to the typed email, not the lead's email
        empresa: lead.empresa ?? null,
      }
    }
  }

  const html = interpolate(campaign.body, leadData)
  const subject = interpolate(campaign.subject, leadData)

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: `${campaign.from_name} <${campaign.from_email}>`,
      to: [email],
      subject: `[TEST] ${subject}`,
      html,
    })

    return NextResponse.json({ success: true, message: `Email de prueba enviado a ${email}` })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: `Error al enviar: ${errorMsg}` }, { status: 500 })
  }
}
