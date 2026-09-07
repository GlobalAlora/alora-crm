// One-off backfill: reconstructs `reuniones` (meeting history, one row per
// scheduled instance) from data that already exists, best-effort, for leads
// that had meetings booked BEFORE this feature shipped.
//
//   - leads.fecha_reunion/reunion_hora (the current/vigente meeting) becomes
//     the FINAL instance for that lead, carrying leads.reunion_asistencia
//     (mapped to null if it was stuck at 'reagendo' — see src/lib/reuniones.ts).
//   - `activities` rows with tipo='reunion' and metadata.booking_id (logged
//     by every TidyCal booking, including reschedules — see
//     src/lib/tidycal.ts) become earlier instances, each closed as
//     'reagendo' unless they match the current one.
//   - Reschedules done directly by LIDIA (bookConfirmedSlot, before this
//     change) left no trace anywhere and cannot be recovered — those leads
//     just get their current meeting as a single instance.
//
// Safe to re-run: any lead that already has rows in `reuniones` is skipped
// entirely, so this only ever fills in leads that never got a row yet.
//
// Usage: node scripts/backfill-reuniones.mjs [--dry-run]

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  const path = new URL('../.env.local', import.meta.url)
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

loadEnvLocal()

const DRY_RUN = process.argv.includes('--dry-run')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (revisá .env.local)')
  process.exit(1)
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

function toArgentina(utcIso) {
  const ms = new Date(utcIso).getTime() - 3 * 60 * 60 * 1000
  const d = new Date(ms)
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) }
}

async function main() {
  const { data: leads, error: leadsErr } = await admin
    .from('leads')
    .select('id, fecha_reunion, reunion_hora, reunion_link, reunion_asistencia')
    .not('fecha_reunion', 'is', null)
    .is('deleted_at', null)

  if (leadsErr) throw leadsErr
  console.log(`[backfill] ${leads.length} leads con fecha_reunion cargada`)

  const { data: reunionActivities, error: actErr } = await admin
    .from('activities')
    .select('lead_id, descripcion, metadata, created_at')
    .eq('tipo', 'reunion')
    .not('metadata->>booking_id', 'is', null)
    .order('created_at', { ascending: true })

  if (actErr) throw actErr

  const activitiesByLead = new Map()
  for (const a of reunionActivities ?? []) {
    if (!a.lead_id) continue
    const startsAt = a.metadata?.starts_at
    if (!startsAt) continue
    if (!activitiesByLead.has(a.lead_id)) activitiesByLead.set(a.lead_id, [])
    activitiesByLead.get(a.lead_id).push({
      booking_id: String(a.metadata.booking_id),
      starts_at: startsAt,
    })
  }

  let leadsInserted = 0
  let rowsInserted = 0
  let leadsSkippedExisting = 0
  let leadsSinHistorialRecuperable = 0

  for (const lead of leads) {
    const { data: existingRows, error: existErr } = await admin
      .from('reuniones')
      .select('id')
      .eq('lead_id', lead.id)
      .limit(1)
    if (existErr) throw existErr
    if (existingRows && existingRows.length > 0) {
      leadsSkippedExisting++
      continue
    }

    const bookings = (activitiesByLead.get(lead.id) ?? [])
      .map((b) => ({ ...b, ...toArgentina(b.starts_at) }))
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())

    // Dedup by (date, time) — a reschedule that landed back on the same
    // slot, or a duplicate activity row, shouldn't produce two instances.
    const seen = new Set()
    const instances = []
    for (const b of bookings) {
      const key = `${b.date}|${b.time}`
      if (seen.has(key)) continue
      seen.add(key)
      instances.push({ fecha_reunion: b.date, reunion_hora: b.time, reunion_link: null, origen: 'tidycal', booking_id: b.booking_id })
    }

    const currentKey = `${lead.fecha_reunion}|${lead.reunion_hora ?? ''}`
    if (!seen.has(currentKey)) {
      instances.push({
        fecha_reunion: lead.fecha_reunion,
        reunion_hora: lead.reunion_hora,
        reunion_link: lead.reunion_link,
        origen: bookings.length > 0 ? 'tidycal' : 'manual', // best guess when there's no direct match
        booking_id: null,
      })
    } else {
      // The current meeting matches a known TidyCal booking exactly — carry
      // its real link over onto that instance.
      const match = instances.find((i) => i.fecha_reunion === lead.fecha_reunion && i.reunion_hora === lead.reunion_hora)
      if (match) match.reunion_link = lead.reunion_link
    }

    if (instances.length === 0) continue

    if (bookings.length === 0) leadsSinHistorialRecuperable++

    const rows = instances.map((instance, i) => {
      const isLast = i === instances.length - 1
      const asistencia = isLast
        ? (lead.reunion_asistencia === 'reagendo' ? null : lead.reunion_asistencia)
        : 'reagendo'
      return {
        lead_id: lead.id,
        fecha_reunion: instance.fecha_reunion,
        reunion_hora: instance.reunion_hora,
        reunion_link: instance.reunion_link,
        asistencia,
        asistencia_at: asistencia ? new Date().toISOString() : null,
        origen: instance.origen,
        booking_id: instance.booking_id,
      }
    })

    if (!DRY_RUN) {
      const { error: insErr } = await admin.from('reuniones').insert(rows)
      if (insErr) throw insErr
    }

    leadsInserted++
    rowsInserted += rows.length
  }

  console.log(`[backfill] ${DRY_RUN ? '(dry-run) ' : ''}Listo.`)
  console.log(`[backfill]   Leads con historial creado: ${leadsInserted} (${rowsInserted} filas)`)
  console.log(`[backfill]   Leads ya tenían reuniones (salteados): ${leadsSkippedExisting}`)
  console.log(`[backfill]   Leads sin historial de TidyCal recuperable (solo la vigente): ${leadsSinHistorialRecuperable}`)
}

main().catch((err) => {
  console.error('[backfill] Error:', err)
  process.exit(1)
})
