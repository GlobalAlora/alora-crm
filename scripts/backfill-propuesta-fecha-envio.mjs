// One-off backfill for propuestas.fecha_envio (run once, after
// add-propuesta-fecha-envio.sql). Every propuesta needs its own real send
// date -- until now only leads.fecha_propuesta existed (one date per LEAD),
// which breaks for leads with more than one propuesta across different
// periods.
//
// Heuristic per lead:
//   - The MOST RECENT propuesta (by created_at) gets leads.fecha_propuesta --
//     that field always reflects the latest send (see POST
//     /api/leads/[id]/propuestas), so it's the trustworthy anchor.
//   - Any OLDER propuestas on the same lead fall back to their own
//     created_at -- there's no better historical signal for those. This is
//     imprecise for the handful of leads whose propuestas were bulk-
//     migrated/backfilled with a created_at that doesn't match the real
//     send date; those print in a separate "REVISAR A MANO" list at the end
//     instead of failing silently.
//
// Safe to re-run: skips any propuesta that already has fecha_envio set.
//
// Usage: node scripts/backfill-propuesta-fecha-envio.mjs [--dry-run]

import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  const envPath = '/Users/Walo/alora-crm/.env.local'
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
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

async function main() {
  const { data: leads, error: leadsErr } = await admin
    .from('leads')
    .select('id, nombre, apellido, fecha_propuesta, propuestas(id, created_at, fecha_envio)')
    .not('fecha_propuesta', 'is', null)
  if (leadsErr) throw leadsErr

  let updated = 0
  let skippedExisting = 0
  const revisarAMano = []

  for (const lead of leads) {
    const props = (lead.propuestas ?? []).filter(p => !p.fecha_envio)
    if (props.length === 0) {
      if ((lead.propuestas ?? []).length > 0) skippedExisting += lead.propuestas.length
      continue
    }

    const sorted = [...props].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const latest = sorted[sorted.length - 1]
    const olderOnes = sorted.slice(0, -1)

    if (!DRY_RUN) {
      const { error } = await admin.from('propuestas').update({ fecha_envio: lead.fecha_propuesta }).eq('id', latest.id)
      if (error) throw error
    }
    updated++

    for (const p of olderOnes) {
      if (!DRY_RUN) {
        const { error } = await admin.from('propuestas').update({ fecha_envio: p.created_at }).eq('id', p.id)
        if (error) throw error
      }
      updated++
      revisarAMano.push({ lead: [lead.nombre, lead.apellido].filter(Boolean).join(' '), leadId: lead.id, propuestaId: p.id, fecha_envio: p.created_at })
    }
  }

  console.log(`[backfill] ${DRY_RUN ? '(dry-run) ' : ''}Listo.`)
  console.log(`[backfill]   Propuestas con fecha_envio seteada: ${updated}`)
  console.log(`[backfill]   Ya tenían fecha_envio (salteadas): ${skippedExisting}`)
  if (revisarAMano.length > 0) {
    console.log(`\n[backfill] ${revisarAMano.length} propuestas viejas (no la última de su lead) quedaron con fecha_envio = su propio created_at, sin un dato más confiable disponible. Revisar si la fecha se ve rara:`)
    for (const r of revisarAMano) {
      console.log(`  ${r.lead} (lead ${r.leadId}) — propuesta ${r.propuestaId} — fecha_envio: ${r.fecha_envio}`)
    }
  }
}

main().catch((err) => {
  console.error('[backfill] Error:', err)
  process.exit(1)
})
