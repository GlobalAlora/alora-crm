/**
 * Gmail integration for Alora CRM.
 *
 * Uses the same service account + domain-wide delegation as Calendar/Drive
 * to send and read emails on behalf of @globalalora.com users.
 *
 * Required env vars (same as Calendar):
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
 *
 * Required Workspace Admin scopes (add alongside Calendar scope):
 *   https://www.googleapis.com/auth/gmail.send
 *   https://www.googleapis.com/auth/gmail.readonly
 */

import { google } from 'googleapis'

// ── Senders ───────────────────────────────────────────────────────────────────

export const GMAIL_SENDERS = [
  { name: 'Bruno',      email: 'bruno@globalalora.com' },
  { name: 'Walo',       email: 'walo@globalalora.com'  },
  { name: 'Info Alora', email: 'info@globalalora.com'  },
] as const

export type SenderEmail = typeof GMAIL_SENDERS[number]['email']

export function getSenderName(email: string): string {
  return GMAIL_SENDERS.find(s => s.email === email)?.name ?? 'Alora'
}

// ── Auth ──────────────────────────────────────────────────────────────────────

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
]

function getGmailClient(impersonateAs: string) {
  const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!email || !privateKey) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
  }

  const auth = new google.auth.JWT({ email, key: privateKey, scopes: GMAIL_SCOPES, subject: impersonateAs })
  return google.gmail({ version: 'v1', auth })
}

// ── Send ──────────────────────────────────────────────────────────────────────

export interface SendGmailInput {
  from:       SenderEmail
  to:         string
  toName?:    string | null
  subject:    string
  html:       string
  threadId?:  string | null  // pass to keep reply in same thread
  inReplyTo?: string | null  // Message-ID header of previous message
  references?: string | null
}

export interface SentGmailResult {
  gmailId:   string   // Gmail internal message id
  threadId:  string
  messageId: string   // RFC 2822 Message-ID header (for future reply threading)
}

/** Build RFC 2822 email and base64url-encode it for the Gmail API */
function buildRaw(input: SendGmailInput): string {
  const fromName = getSenderName(input.from)
  const toHeader = input.toName ? `"${input.toName}" <${input.to}>` : input.to

  const headers: string[] = [
    `From: "${fromName}" <${input.from}>`,
    `To: ${toHeader}`,
    `Subject: =?utf-8?B?${Buffer.from(input.subject).toString('base64')}?=`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
  ]
  if (input.inReplyTo)  headers.push(`In-Reply-To: ${input.inReplyTo}`)
  if (input.references) headers.push(`References: ${input.references}`)

  const raw = [...headers, '', input.html].join('\r\n')
  return Buffer.from(raw).toString('base64url')
}

export async function sendGmail(input: SendGmailInput): Promise<SentGmailResult> {
  const gmail = getGmailClient(input.from)

  const requestBody: { raw: string; threadId?: string } = { raw: buildRaw(input) }
  if (input.threadId) requestBody.threadId = input.threadId

  const { data } = await gmail.users.messages.send({ userId: 'me', requestBody })
  if (!data.id) throw new Error('Gmail API returned no message ID')

  // Fetch Message-ID header so future replies can thread correctly
  const { data: msg } = await gmail.users.messages.get({
    userId: 'me',
    id: data.id,
    format: 'metadata',
    metadataHeaders: ['Message-ID'],
  })
  const messageId = msg.payload?.headers?.find(h => h.name === 'Message-ID')?.value ?? ''

  return { gmailId: data.id, threadId: data.threadId ?? '', messageId }
}

// ── Fetch / sync ──────────────────────────────────────────────────────────────

export interface ParsedEmail {
  gmailId:      string
  threadId:     string
  messageId:    string
  from:         string
  fromName:     string
  to:           string
  subject:      string
  bodyHtml:     string
  date:         Date
  direction:    'inbound' | 'outbound'
  inboxAccount: string
}

/**
 * List gmail IDs for emails involving leadEmail across all monitored inboxes.
 * Returns only metadata (fast) — caller decides which to fetch in full.
 */
export async function listEmailIdsForLead(
  leadEmail: string
): Promise<{ gmailId: string; inboxAccount: string }[]> {
  const results: { gmailId: string; inboxAccount: string }[] = []

  for (const sender of GMAIL_SENDERS) {
    try {
      const gmail = getGmailClient(sender.email)
      const { data } = await gmail.users.messages.list({
        userId: 'me',
        q: `from:${leadEmail} OR to:${leadEmail}`,
        maxResults: 50,
      })
      for (const msg of data.messages ?? []) {
        if (msg.id) results.push({ gmailId: msg.id, inboxAccount: sender.email })
      }
    } catch (err) {
      // Log so we can diagnose scope/permission issues
      console.error(`[gmail] listEmailIds failed for ${sender.email}:`, err instanceof Error ? err.message : err)
    }
  }

  // Deduplicate (same message can appear in multiple inboxes via CC)
  const seen = new Set<string>()
  return results.filter(r => { if (seen.has(r.gmailId)) return false; seen.add(r.gmailId); return true })
}

/** Fetch full content for a single Gmail message */
export async function fetchGmailMessage(
  inboxAccount: string,
  gmailId: string
): Promise<ParsedEmail | null> {
  try {
    const gmail = getGmailClient(inboxAccount)
    const { data } = await gmail.users.messages.get({
      userId: 'me',
      id: gmailId,
      format: 'full',
    })

    const headers = data.payload?.headers ?? []
    const h = (name: string) =>
      headers.find(hdr => hdr.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

    const fromRaw  = h('from')
    const fromMatch = fromRaw.match(/^"?([^"<]*)"?\s*<([^>]+)>$/)
    const fromEmail = fromMatch ? fromMatch[2].trim() : fromRaw.trim()
    const fromName  = fromMatch ? fromMatch[1].trim() : fromEmail

    const isSenderAddress = (addr: string) =>
      GMAIL_SENDERS.some(s => s.email.toLowerCase() === addr.toLowerCase())

    return {
      gmailId:      data.id!,
      threadId:     data.threadId ?? '',
      messageId:    h('message-id'),
      from:         fromEmail,
      fromName,
      to:           h('to'),
      subject:      h('subject'),
      bodyHtml:     extractBody(data.payload),
      date:         new Date(parseInt(data.internalDate ?? '0')),
      direction:    isSenderAddress(fromEmail) ? 'outbound' : 'inbound',
      inboxAccount,
    }
  } catch {
    return null
  }
}

// ── Body extraction ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: any): string {
  if (!payload) return ''

  if (payload.body?.data) {
    const text = Buffer.from(payload.body.data, 'base64url').toString('utf-8')
    if (payload.mimeType === 'text/html')  return text
    if (payload.mimeType === 'text/plain') return `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(text)}</pre>`
  }

  if (Array.isArray(payload.parts)) {
    // Prefer HTML part
    const htmlPart = payload.parts.find((p: { mimeType?: string }) => p.mimeType === 'text/html')
    if (htmlPart) return extractBody(htmlPart)
    const textPart = payload.parts.find((p: { mimeType?: string }) => p.mimeType === 'text/plain')
    if (textPart) return extractBody(textPart)
    for (const part of payload.parts) {
      const body = extractBody(part)
      if (body) return body
    }
  }

  return ''
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
