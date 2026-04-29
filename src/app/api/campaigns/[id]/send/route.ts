import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLeadsByFilters } from '@/lib/segment'
import { Resend } from 'resend'
import type { SegmentFilters } from '@/types'

type Params = { params: Promise<{ id: string }> }

const BATCH_SIZE = 10
const BATCH_DELAY_MS = 1000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Load campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
  }

  if (campaign.status === 'sending') {
    return NextResponse.json({ error: 'La campaña ya está en envío' }, { status: 409 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY no configurado' }, { status: 500 })
  }

  // Resolve recipients
  const adminSupabase = createAdminClient()
  const filters: SegmentFilters = campaign.filters ?? {}
  const leads = await getLeadsByFilters(adminSupabase, filters)

  const leadsWithEmail = leads.filter((l) => l.email)

  if (leadsWithEmail.length === 0) {
    return NextResponse.json({ error: 'No hay destinatarios con email en el segmento' }, { status: 400 })
  }

  // Mark campaign as sending
  await supabase
    .from('campaigns')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', id)

  // Insert pending recipients (deduplicated)
  const recipientRows = leadsWithEmail.map((l) => ({
    campaign_id: id,
    lead_id: l.id,
    email: l.email!,
    status: 'pending',
  }))

  await adminSupabase
    .from('campaign_recipients')
    .upsert(recipientRows, { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true })

  // Send in background — respond immediately to avoid Vercel timeout
  sendEmails(id, campaign, leadsWithEmail).catch(() => {
    // Error handling done inside sendEmails
  })

  return NextResponse.json({
    success: true,
    message: `Iniciando envío a ${leadsWithEmail.length} destinatarios`,
    count: leadsWithEmail.length,
  })
}

async function sendEmails(
  campaignId: string,
  campaign: { subject: string; body: string; from_name: string; from_email: string },
  leads: { id: string; nombre: string; apellido: string | null; email: string | null }[]
) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const adminSupabase = createAdminClient()

  let totalSent = 0
  let totalFailed = 0

  // Send in batches
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (lead) => {
        try {
          await resend.emails.send({
            from: `${campaign.from_name} <${campaign.from_email}>`,
            to: [lead.email!],
            subject: campaign.subject,
            html: campaign.body,
          })

          await adminSupabase
            .from('campaign_recipients')
            .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
            .eq('campaign_id', campaignId)
            .eq('lead_id', lead.id)

          totalSent++
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Error desconocido'

          await adminSupabase
            .from('campaign_recipients')
            .update({ status: 'failed', error: errorMsg })
            .eq('campaign_id', campaignId)
            .eq('lead_id', lead.id)

          totalFailed++
        }
      })
    )

    // Delay between batches (rate limiting)
    if (i + BATCH_SIZE < leads.length) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  // Mark campaign as sent
  await adminSupabase
    .from('campaigns')
    .update({
      status: totalFailed === leads.length ? 'failed' : 'sent',
      total_sent: totalSent,
      total_failed: totalFailed,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId)
}
