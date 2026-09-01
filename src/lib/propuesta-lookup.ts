const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** El param de /propuesta/[id] puede ser el UUID real o el slug legible. */
export function slugOrIdColumn(param: string): 'id' | 'slug' {
  return UUID_RE.test(param) ? 'id' : 'slug'
}
