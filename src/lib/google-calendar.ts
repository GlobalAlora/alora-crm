/**
 * Google Calendar integration for Alora CRM.
 *
 * Uses the same service account as Google Drive but with domain-wide delegation
 * so it can create events on behalf of any @globalalora.com user.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   — service account email
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY — private key (with \n)
 *   GOOGLE_CALENDAR_SUBJECT        — @globalalora.com user to impersonate
 *                                    (e.g. "agenda@globalalora.com")
 */

import { google } from 'googleapis'

// Argentina is UTC-3 (no DST)
const TZ = 'America/Argentina/Buenos_Aires'

// ── Auth ──────────────────────────────────────────────────────────────────────

function getCalendarClient() {
  const email      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const subject    = process.env.GOOGLE_CALENDAR_SUBJECT

  if (!email || !privateKey || !subject) {
    throw new Error(
      'Missing env vars: GOOGLE_SERVICE_ACCOUNT_EMAIL, ' +
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_CALENDAR_SUBJECT'
    )
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject, // domain-wide delegation: impersonate this @globalalora.com user
  })

  return google.calendar({ version: 'v3', auth })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildEventTitle(lead: {
  nombre: string
  apellido: string | null
}): string {
  const fullName = [lead.nombre, lead.apellido].filter(Boolean).join(' ')
  return `Reunión ${fullName} + Alora`
}

/**
 * Build an RFC3339 datetime string for the given date + time in Argentina TZ.
 * fecha: "YYYY-MM-DD"   hora: "HH:MM" or "HH:MM:SS"
 * Falls back to 09:00 if hora is missing.
 */
function buildDateTime(fecha: string, hora: string | null): string {
  const time = hora ? hora.slice(0, 5) : '09:00'
  // Return as a local ISO string — the event will carry the timeZone field
  return `${fecha.slice(0, 10)}T${time}:00`
}

/**
 * Build the end datetime 30 minutes after the start.
 * Falls back to 09:30 when hora is missing.
 */
function buildEndDateTime(fecha: string, hora: string | null): string {
  if (!hora) return `${fecha.slice(0, 10)}T09:30:00`
  const [hStr, mStr] = hora.slice(0, 5).split(':')
  const total = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + 30
  const h = String(Math.floor(total / 60) % 24).padStart(2, '0')
  const m = String(total % 60).padStart(2, '0')
  return `${fecha.slice(0, 10)}T${h}:${m}:00`
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface CalendarEventResult {
  eventId: string
  eventUrl: string
}

export interface CreateCalendarEventInput {
  leadId: string
  nombre: string
  apellido: string | null
  empresa: string | null
  email: string | null          // lead email → invited as attendee
  fecha_reunion: string         // "YYYY-MM-DD" or full ISO
  reunion_hora: string | null   // "HH:MM"
  reunion_link: string | null   // Google Meet / Zoom URL
  responsable_email?: string | null
}

/**
 * Create a new Google Calendar event for a scheduled meeting.
 */
export async function createCalendarEvent(
  input: CreateCalendarEventInput
): Promise<CalendarEventResult> {
  const calendar = getCalendarClient()

  const startLocal = buildDateTime(input.fecha_reunion, input.reunion_hora)
  // Duration: 30 minutes
  const endLocal = buildEndDateTime(input.fecha_reunion, input.reunion_hora)

  const attendees: { email: string }[] = []
  if (input.email) attendees.push({ email: input.email })
  if (input.responsable_email) attendees.push({ email: input.responsable_email })

  const { data: event } = await calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: 'all', // sends email invitation to all attendees
    conferenceDataVersion: 1, // enables automatic Google Meet creation
    requestBody: {
      summary: buildEventTitle(input),
      description: [
        `Lead ID: ${input.leadId}`,
        input.empresa ? `Empresa: ${input.empresa}` : null,
        input.reunion_link ? `Link: ${input.reunion_link}` : null,
        `\nCreado automáticamente por Alora CRM`,
      ].filter(Boolean).join('\n'),
      location: input.reunion_link ?? undefined,
      start: { dateTime: startLocal, timeZone: TZ },
      end:   { dateTime: endLocal,   timeZone: TZ },
      attendees: attendees.length ? attendees : undefined,
      conferenceData: {
        createRequest: {
          requestId: `alora-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    },
  })

  if (!event.id) throw new Error('Calendar API returned no event ID')

  return {
    eventId:  event.id,
    eventUrl: event.htmlLink ?? `https://calendar.google.com/calendar/event?eid=${event.id}`,
  }
}

/**
 * Update an existing calendar event (e.g. when fecha_reunion changes).
 */
export async function updateCalendarEvent(
  eventId: string,
  input: CreateCalendarEventInput
): Promise<CalendarEventResult> {
  const calendar = getCalendarClient()

  const startLocal = buildDateTime(input.fecha_reunion, input.reunion_hora)
  // Duration: 30 minutes
  const endLocal = buildEndDateTime(input.fecha_reunion, input.reunion_hora)

  const attendees: { email: string }[] = []
  if (input.email) attendees.push({ email: input.email })
  if (input.responsable_email) attendees.push({ email: input.responsable_email })

  const { data: event } = await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    sendUpdates: 'all', // sends email notification on updates
    conferenceDataVersion: 1,
    requestBody: {
      summary:  buildEventTitle(input),
      location: input.reunion_link ?? undefined,
      start: { dateTime: startLocal, timeZone: TZ },
      end:   { dateTime: endLocal,   timeZone: TZ },
      attendees: attendees.length ? attendees : undefined,
    },
  })

  return {
    eventId:  event.id ?? eventId,
    eventUrl: event.htmlLink ?? `https://calendar.google.com/calendar/event?eid=${eventId}`,
  }
}

/**
 * Delete a calendar event (e.g. when lead is cancelled).
 * Non-fatal — errors are swallowed.
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  try {
    const calendar = getCalendarClient()
    await calendar.events.delete({ calendarId: 'primary', eventId })
  } catch {
    // best-effort
  }
}
