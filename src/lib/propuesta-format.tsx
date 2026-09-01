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
