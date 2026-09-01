import React from 'react'

/**
 * Splits text on **bold** markdown-style markers into plain/bold segments,
 * shared by the web renderer (returns React nodes) and the PDF renderer
 * (which builds its own nested <Text> spans from the same split logic).
 */
export function splitBoldSegments(text: string): { text: string; bold: boolean }[] {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts
    .filter((p) => p.length > 0)
    .map((p, i) => ({ text: p, bold: i % 2 === 1 }))
}

/** Web (React DOM) version — renders **bold** spans as <strong>. */
export function renderBoldText(text: string): React.ReactNode {
  return splitBoldSegments(text).map((seg, i) =>
    seg.bold ? <strong key={i} className="font-semibold">{seg.text}</strong> : <React.Fragment key={i}>{seg.text}</React.Fragment>
  )
}

type EditableTag = 'span' | 'p' | 'div' | 'h1'

/**
 * Texto editable in-place, compartido por PropuestaDocument y
 * PropuestaResumenDocument. En modo lectura renderiza **negrita**; en modo
 * edición muestra el texto crudo (con los ** visibles) y confirma el cambio
 * al perder foco -- edición "no controlada" mientras se tipea, sin re-render
 * en cada tecla, para no perder el cursor.
 */
export function EditableText({
  value, editable, onCommit, as = 'span', style, className, multiline,
}: {
  value: string
  editable: boolean
  onCommit: (next: string) => void
  as?: EditableTag
  style?: React.CSSProperties
  className?: string
  multiline?: boolean
}) {
  const Tag = as
  if (!editable) {
    return <Tag style={style} className={className}>{renderBoldText(value)}</Tag>
  }
  return (
    <Tag
      contentEditable
      suppressContentEditableWarning
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const text = (e.currentTarget.textContent ?? '').trim()
        if (text && text !== value) onCommit(text)
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      style={{ ...style, outline: 'none', cursor: 'text' }}
      className={`${className ?? ''} rounded px-0.5 -mx-0.5 hover:bg-blue-50 focus:bg-blue-50 focus:ring-1 focus:ring-blue-300 transition-colors`}
    >
      {value}
    </Tag>
  )
}
