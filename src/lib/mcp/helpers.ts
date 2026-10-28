import type { SupabaseClient } from '@supabase/supabase-js'

export const AR_TZ = 'America/Argentina/Buenos_Aires'

/** Error que el agente ve como resultado de la herramienta (isError: true). */
export class ToolError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): boolean {
  return typeof v === 'string' && UUID_RE.test(v)
}

/** Fecha de hoy en Argentina como YYYY-MM-DD. */
export function todayAR(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: AR_TZ })
}

/** YYYY-MM-DD en Argentina, desplazado `days` días desde hoy. */
export function dateAR(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toLocaleDateString('sv-SE', { timeZone: AR_TZ })
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86_400_000)
}

/** Limpia texto libre para usarlo dentro de un filtro .or() de PostgREST. */
export function sanitizeSearch(text: string): string {
  return text.replace(/[,()%*\\]/g, ' ').trim()
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function num(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && isFinite(Number(v))) return Number(v)
  return undefined
}

export function fullName(p: { nombre?: string | null; apellido?: string | null; empresa?: string | null }): string {
  const name = [p.nombre, p.apellido].filter(Boolean).join(' ')
  return p.empresa ? `${name}${name ? ' — ' : ''}${p.empresa}` : name
}

// ── Resolución de entidades por nombre o id ──────────────────────────────

export async function resolveUser(db: SupabaseClient, ref: unknown): Promise<string | null> {
  const r = str(ref)
  if (!r) return null
  if (isUuid(r)) return r
  const q = sanitizeSearch(r)
  const { data } = await db
    .from('users')
    .select('id, full_name, email')
    .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(5)
  if (!data?.length) throw new ToolError(`No encontré ningún usuario del CRM que coincida con "${r}". Usá listar_usuarios para ver los nombres.`)
  if (data.length > 1) {
    const exact = data.find(u => u.full_name?.toLowerCase() === r.toLowerCase())
    if (exact) return exact.id
    throw new ToolError(`"${r}" coincide con varios usuarios: ${data.map(u => `${u.full_name} (${u.id})`).join(', ')}. Especificá cuál.`)
  }
  return data[0].id
}

export async function resolveLeadId(db: SupabaseClient, ref: unknown): Promise<string> {
  const r = str(ref)
  if (!r) throw new ToolError('Falta indicar el lead (id, nombre, empresa o email).')
  if (isUuid(r)) return r
  const q = sanitizeSearch(r)
  const { data } = await db
    .from('leads')
    .select('id, nombre, apellido, empresa, estado_pipeline')
    .is('deleted_at', null)
    .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%,empresa.ilike.%${q}%,email.ilike.%${q}%`)
    .order('last_activity_at', { ascending: false })
    .limit(8)
  if (!data?.length) throw new ToolError(`No encontré ningún lead que coincida con "${r}".`)
  if (data.length > 1) {
    const exact = data.filter(l =>
      [l.empresa, l.nombre, [l.nombre, l.apellido].filter(Boolean).join(' ')]
        .some(v => v?.toLowerCase() === r.toLowerCase()),
    )
    if (exact.length === 1) return exact[0].id
    throw new ToolError(
      `"${r}" coincide con varios leads: ${data.map(l => `${fullName(l)} [${l.estado_pipeline}] (${l.id})`).join('; ')}. Indicá el id.`,
    )
  }
  return data[0].id
}

export async function resolveProjectId(db: SupabaseClient, ref: unknown): Promise<string> {
  const r = str(ref)
  if (!r) throw new ToolError('Falta indicar el proyecto (id o nombre).')
  if (isUuid(r)) return r
  const q = sanitizeSearch(r)
  const { data } = await db
    .from('projects')
    .select('id, nombre, estado')
    .is('deleted_at', null)
    .ilike('nombre', `%${q}%`)
    .limit(8)
  if (!data?.length) throw new ToolError(`No encontré ningún proyecto que coincida con "${r}".`)
  if (data.length > 1) {
    const exact = data.find(p => p.nombre.toLowerCase() === r.toLowerCase())
    if (exact) return exact.id
    throw new ToolError(`"${r}" coincide con varios proyectos: ${data.map(p => `${p.nombre} [${p.estado}] (${p.id})`).join('; ')}. Indicá el id.`)
  }
  return data[0].id
}

export async function userNames(db: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  const map = new Map<string, string>()
  if (!unique.length) return map
  const { data } = await db.from('users').select('id, full_name').in('id', unique)
  for (const u of data ?? []) map.set(u.id, u.full_name)
  return map
}
