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

/**
 * Returns the next N available 30-minute slots on the calendar of
 * GOOGLE_CALENDAR_SUBJECT during business hours (Mon–Fri 9:00–18:00 AR time).
 * Requires at least 2 hours of advance notice.
 * Returns [] if Calendar is not configured or the freebusy query fails.
 */
export async function getAvailableSlots(slotsNeeded = 3): Promise<Date[]> {
  const calendarId = process.env.GOOGLE_CALENDAR_SUBJECT
  if (!calendarId) return []

  try {
    const calendar = getCalendarClient()

    const AR_OFFSET_MS  = -3 * 60 * 60 * 1000   // UTC-3, no DST
    const SLOT_MS       = 30 * 60 * 1000
    const BIZ_START_H   = 9
    const BIZ_END_H     = 18
    const MIN_NOTICE_MS = 2 * 60 * 60 * 1000     // 2 hours ahead

    const nowUTC     = new Date()
    const rangeEnd   = new Date(nowUTC.getTime() + 10 * 24 * 60 * 60 * 1000)

    const { data } = await calendar.freebusy.query({
      requestBody: {
        timeMin:  nowUTC.toISOString(),
        timeMax:  rangeEnd.toISOString(),
        items:    [{ id: calendarId }],
      },
    })

    const busy = (data.calendars?.[calendarId]?.busy ?? []).map(b => ({
      start: new Date(b.start!),
      end:   new Date(b.end!),
    }))

    const available: Date[] = []

    // Walk day by day in AR local time
    const todayAR = new Date(nowUTC.getTime() + AR_OFFSET_MS)
    todayAR.setHours(0, 0, 0, 0)

    for (let d = 0; d < 10 && available.length < slotsNeeded; d++) {
      const dayAR  = new Date(todayAR.getTime() + d * 86_400_000)
      const dow    = dayAR.getDay()
      if (dow === 0 || dow === 6) continue  // skip weekends

      for (let h = BIZ_START_H; h < BIZ_END_H && available.length < slotsNeeded; h++) {
        for (let m = 0; m < 60 && available.length < slotsNeeded; m += 30) {
          // Last slot must end by BIZ_END_H
          if (h === BIZ_END_H - 1 && m > 30) continue

          const slotAR  = new Date(dayAR)
          slotAR.setHours(h, m, 0, 0)
          const slotUTC = new Date(slotAR.getTime() - AR_OFFSET_MS)
          const slotEndUTC = new Date(slotUTC.getTime() + SLOT_MS)

          if (slotUTC.getTime() - nowUTC.getTime() < MIN_NOTICE_MS) continue

          const overlaps = busy.some(b => slotUTC < b.end && slotEndUTC > b.start)
          if (!overlaps) available.push(slotUTC)
        }
      }
    }

    return available
  } catch (err) {
    console.error('[Calendar] getAvailableSlots failed:', err)
    return []
  }
}

const AR_OFFSET_MS = -3 * 60 * 60 * 1000

/** Format a UTC Date as a human-readable Argentine time string. */
export function formatSlotAR(utcDate: Date): { fecha: string; hora: string; label: string } {
  const ar = new Date(utcDate.getTime() + AR_OFFSET_MS)
  const days   = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const h = String(ar.getHours()).padStart(2, '0')
  const m = String(ar.getMinutes()).padStart(2, '0')
  return {
    fecha: ar.toISOString().slice(0, 10),                    // YYYY-MM-DD
    hora:  `${h}:${m}`,                                      // HH:MM
    label: `${days[ar.getDay()]} ${ar.getDate()} ${months[ar.getMonth()]} — ${h}:${m} hs`,
  }
}
