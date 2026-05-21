/**
 * POST /api/leads/[id]/sync-emails
 *
 * Syncs emails from all @globalalora.com inboxes for a given lead.
 * Only fetches and stores messages not yet logged as activities.
 * Returns the count of new emails found.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listEmailIdsForLead, fetchGmailMessage } from '@/lib/google-gmail'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id: leadId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    return NextResponse.json({ synced: 0, message: 'Gmail no configurado' })
  }

  const adminSupabase = createAdminClient()

  // Fetch lead email
  const { data: lead } = await adminSupabase
    .from('leads')
    .select('email')
    .eq('id', leadId)
    .single()

  if (!lead?.email) return NextResponse.json({ synced: 0, message: 'Lead sin email' })

  // List all gmail IDs for this lead across all inboxes
  let gmailRefs: Awaited<ReturnType<typeof listEmailIdsForLead>>
  try {
    gmailRefs = await listEmailIdsForLead(lead.email)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync-emails] listEmailIds error:', msg)
    return NextResponse.json({ synced: 0, error: msg }, { status: 500 })
  }

  console.log(`[sync-emails] Found ${gmailRefs.length} gmail refs for ${lead.email}`)
  if (!gmailRefs.length) return NextResponse.json({ synced: 0, found: 0 })

  // Find which gmail_ids are already stored as activities
  const { data: existing } = await adminSupabase
    .from('activities')
    .select('metadata')
    .eq('lead_id', leadId)
    .eq('tipo', 'email')

  const storedGmailIds = new Set<string>(
    (existing ?? [])
      .map(a => (a.metadata as { gmail_id?: string } | null)?.gmail_id)
      .filter(Boolean) as string[]
  )

  const newRefs = gmailRefs.filter(r => !storedGmailIds.has(r.gmailId))
  console.log(`[sync-emails] ${newRefs.length} new messages to fetch (${storedGmailIds.size} already stored)`)

  // Fetch and store only new messages
  let synced = 0
  for (const ref of newRefs) {
    let email: Awaited<ReturnType<typeof fetchGmailMessage>>
    try {
      email = await fetchGmailMessage(ref.inboxAccount, ref.gmailId)
    } catch (err) {
      console.error('[sync-emails] fetchGmailMessage error:', err)
      continue
    }
    if (!email) continue

    const { error: insertError } = await adminSupabase.from('activities').insert({
      lead_id:  leadId,
      user_id:  null,
      tipo:     'email',
      descripcion: [
        `<strong>${email.direction === 'inbound' ? 'De' : 'Para'}:</strong> ${email.direction === 'inbound' ? email.from : email.to}`,
        `<strong>Asunto:</strong> ${email.subject}`,
        '',
        email.bodyHtml || `<p>${email.subject}</p>`,
      ].join('<br>'),
      metadata: {
        direction:   email.direction,
        subject:     email.subject,
        from:        email.from,
        from_name:   email.fromName,
        to:          email.to,
        gmail_id:    email.gmailId,
        thread_id:   email.threadId,
        message_id:  email.messageId,
        inbox:       email.inboxAccount,
        received_at: email.date.toISOString(),
      },
    })

    if (insertError) {
      console.error('[sync-emails] insert error:', insertError.message)
    } else {
      synced++
    }
  }

  return NextResponse.json({ synced, found: gmailRefs.length, new: newRefs.length })
}
