/**
 * Parses the "Próximos pasos" action-item list out of a Google Meet/Gemini
 * meeting-notes email body. Only that section is relevant — everything
 * before it (Resumen, topic headings) and after it (Detalles, Gemini's
 * feedback footer) is narrative and gets ignored.
 */
export interface ParsedActionItem {
  nombre: string
  titulo: string
  descripcion: string
}

const SECTION_HEADING_RE = /^\s*pr[oó]ximos\s+pasos\s*$/i
const NEXT_HEADING_RE = /^\s*detalles\s*$/i
const FOOTER_RE = /revisa las notas de gemini/i
const BULLET_RE = /^\s*[*\-•]\s*\[([^\]]+)\]\s*([^:]+):\s*(.+)$/

export function parseActionItems(body: string): ParsedActionItem[] {
  if (!body) return []

  const lines = body.replace(/\r\n/g, '\n').split('\n')

  const startIdx = lines.findIndex((l) => SECTION_HEADING_RE.test(l))
  if (startIdx === -1) return []

  const relevant: string[] = []
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (NEXT_HEADING_RE.test(line) || FOOTER_RE.test(line)) break
    relevant.push(line)
  }

  const items: ParsedActionItem[] = []
  let current: ParsedActionItem | null = null

  for (const rawLine of relevant) {
    const line = rawLine.trim()
    if (!line) continue

    const match = line.match(BULLET_RE)
    if (match) {
      if (current) items.push(current)
      current = {
        nombre: match[1].trim(),
        titulo: match[2].trim(),
        descripcion: match[3].trim(),
      }
    } else if (current) {
      // Word-wrapped continuation of the previous bullet's description
      current.descripcion = `${current.descripcion} ${line}`.trim()
    }
  }
  if (current) items.push(current)

  return items
}
