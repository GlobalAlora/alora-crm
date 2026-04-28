'use client'

import { useState, useRef, useEffect } from 'react'
import { Check, X, Pencil } from 'lucide-react'

interface InlineEditProps {
  value: string | number | null
  onSave: (value: string) => void
  type?: 'text' | 'number' | 'date' | 'time' | 'email' | 'tel' | 'select'
  options?: { value: string; label: string }[]
  placeholder?: string
  label?: string
  isLoading?: boolean
  renderDisplay?: (value: string | number | null) => React.ReactNode
}

export function InlineEdit({
  value,
  onSave,
  type = 'text',
  options,
  placeholder = 'Sin valor',
  label,
  isLoading,
  renderDisplay,
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(value ?? ''))
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isEditing])

  const handleSave = () => {
    onSave(editValue)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(String(value ?? ''))
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') handleCancel()
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        {type === 'select' && options ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 text-sm border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          >
            <option value="">Seleccionar...</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 text-sm border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        )}
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="p-1 text-green-600 hover:bg-green-50 rounded"
        >
          <Check size={14} />
        </button>
        <button
          onClick={handleCancel}
          disabled={isLoading}
          className="p-1 text-red-600 hover:bg-red-50 rounded"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div
      className="group flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded px-1 -mx-1 py-0.5 -my-0.5 transition-colors"
      onClick={() => setIsEditing(true)}
    >
      <div className="flex-1 min-w-0">
        {label && <span className="text-xs text-slate-400 block">{label}</span>}
        {renderDisplay ? (
          renderDisplay(value)
        ) : (
          <span className={`text-sm ${value ? 'text-slate-700' : 'text-slate-400 italic'}`}>
            {value || placeholder}
          </span>
        )}
      </div>
      <Pencil size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )
}

interface InlineEditTextAreaProps {
  value: string | null
  onSave: (value: string) => void
  placeholder?: string
  label?: string
  isLoading?: boolean
  rows?: number
}

export function InlineEditTextArea({
  value,
  onSave,
  placeholder = 'Sin valor',
  label,
  isLoading,
  rows = 3,
}: InlineEditTextAreaProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value || '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isEditing])

  const handleSave = () => {
    onSave(editValue)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(value || '')
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleCancel()
    if (e.key === 'Enter' && e.metaKey) handleSave()
  }

  if (isEditing) {
    return (
      <div className="space-y-2">
        <textarea
          ref={textareaRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={rows}
          className="w-full text-sm border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <Check size={12} />
            Guardar
          </button>
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="flex items-center gap-1 text-xs text-slate-600 px-2 py-1 rounded hover:bg-slate-100"
          >
            <X size={12} />
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="group cursor-pointer hover:bg-slate-50 rounded px-1 -mx-1 py-0.5 -my-0.5 transition-colors"
      onClick={() => setIsEditing(true)}
    >
      {label && <span className="text-xs text-slate-400 block mb-1">{label}</span>}
      <div className="flex items-start gap-2">
        <span className={`text-sm ${value ? 'text-slate-700' : 'text-slate-400 italic'}`}>
          {value || placeholder}
        </span>
        <Pencil size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
      </div>
    </div>
  )
}
