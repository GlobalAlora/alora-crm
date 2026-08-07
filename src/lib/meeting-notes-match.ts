/**
 * Fuzzy-matches the free-text name/title/description extracted from a
 * meeting-notes bullet against existing CRM users and projects. Never
 * guesses — returns null rather than picking a low-confidence match, since
 * a wrong auto-assignment is worse than an unassigned task.
 */
interface MatchableUser {
  id: string
  full_name: string | null
}

interface MatchableProject {
  id: string
  nombre: string
}

const GROUP_NAMES = new Set(['el grupo', 'grupo', 'equipo', 'todos'])

const ACCENTS: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => ACCENTS[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim()
}

export function matchUser(nombre: string, users: MatchableUser[]): string | null {
  const n = normalize(nombre)
  if (!n || GROUP_NAMES.has(n)) return null

  for (const u of users) {
    const un = normalize(u.full_name ?? '')
    if (un && (un === n || un.includes(n) || n.includes(un))) return u.id
  }
  return null
}

export function matchProject(titulo: string, descripcion: string, projects: MatchableProject[]): string | null {
  const text = normalize(`${titulo} ${descripcion}`)
  let best: { id: string; len: number } | null = null

  for (const p of projects) {
    const pn = normalize(p.nombre)
    // Skip very short names (e.g. "IA") — they'd match almost anything
    if (pn.length < 3 || !text.includes(pn)) continue
    if (!best || pn.length > best.len) best = { id: p.id, len: pn.length }
  }
  return best?.id ?? null
}
