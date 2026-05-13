/**
 * Timezone utilities for Argentina (America/Argentina/Buenos_Aires).
 *
 * The DB column `vencimiento` is `timestamptz` (always stored as UTC).
 * Clients may send either:
 *   a) A raw datetime-local string: "2026-05-09T14:00"  (no timezone → treat as Argentina local)
 *   b) A full UTC ISO string:       "2026-05-09T17:00:00.000Z"  (already timezone-aware)
 *
 * This module normalises both to a proper UTC ISO string before DB storage.
 */

const AR_TZ = 'America/Argentina/Buenos_Aires'

/**
 * Convert a vencimiento value received from the client into a UTC ISO string
 * suitable for storing in a `timestamptz` Postgres column.
 *
 * - If the string already contains timezone info (Z or ±HH:MM) it is passed
 *   through via `new Date()` which honours the offset.
 * - If it is a bare datetime-local string ("YYYY-MM-DDTHH:mm") it is treated
 *   as Argentina local time and converted to UTC using the Intl API — no
 *   hardcoded numeric offsets.
 *
 * Returns null for falsy input or unparseable strings.
 */
export function normaliseVencimiento(raw: string | null | undefined): string | null {
  if (!raw) return null

  // Already timezone-aware (ends with Z or ±HH:MM) — honour the offset directly
  if (/Z$|[+-]\d{2}:\d{2}$/.test(raw)) {
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  // Bare datetime-local "YYYY-MM-DDTHH:mm" — interpret as Argentina local time
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number)

  // Iteratively find the UTC ms that, when expressed in AR timezone, equals
  // the desired local time. Converges in ≤1 iteration (Argentina has no DST).
  let utcMs = Date.UTC(y, mo - 1, d, h, mi) // naive seed
  for (let i = 0; i < 3; i++) {
    const s = new Date(utcMs).toLocaleString('sv-SE', { timeZone: AR_TZ })
    // s = "YYYY-MM-DD HH:mm:ss"
    const diff =
      Date.UTC(y, mo - 1, d, h, mi) -
      Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16))
    if (diff === 0) break
    utcMs += diff
  }
  return new Date(utcMs).toISOString()
}
