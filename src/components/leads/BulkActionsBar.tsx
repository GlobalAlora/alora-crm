'use client'

import { X } from 'lucide-react'

interface BulkActionsBarProps {
  selectedIds: string[]
  onClear: () => void
}

export function BulkActionsBar({ selectedIds, onClear }: BulkActionsBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm flex-shrink-0">
      <span className="font-medium">{selectedIds.length} seleccionado{selectedIds.length > 1 ? 's' : ''}</span>
      <div className="flex-1" />
      <button
        onClick={onClear}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-500 transition-colors"
      >
        <X size={13} />
        Deseleccionar
      </button>
    </div>
  )
}
