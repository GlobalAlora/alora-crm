'use client'

import { useState } from 'react'
import { Plus, X, ArrowUpDown, Mail, Star } from 'lucide-react'
import type { Lead } from '@/types'

interface EmailsSectionProps {
  lead: Pick<Lead, 'email' | 'email_secundario'>
  isLoading?: boolean
  onSave: (data: { email: string | null; email_secundario: string | null }) => void
}

export function EmailsSection({ lead, isLoading, onSave }: EmailsSectionProps) {
  const [editing, setEditing] = useState(false)
  const [primary, setPrimary] = useState(lead.email ?? '')
  const [secondary, setSecondary] = useState(lead.email_secundario ?? '')
  const [showSecondary, setShowSecondary] = useState(!!lead.email_secundario)

  // Sync when lead changes externally
  const startEdit = () => {
    setPrimary(lead.email ?? '')
    setSecondary(lead.email_secundario ?? '')
    setShowSecondary(!!lead.email_secundario)
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setPrimary(lead.email ?? '')
    setSecondary(lead.email_secundario ?? '')
    setShowSecondary(!!lead.email_secundario)
  }

  const save = () => {
    onSave({
      email: primary.trim() || null,
      email_secundario: showSecondary && secondary.trim() ? secondary.trim() : null,
    })
    setEditing(false)
  }

  const swapEmails = () => {
    const tmp = primary
    setPrimary(secondary)
    setSecondary(tmp)
  }

  const removeSecondary = () => {
    setSecondary('')
    setShowSecondary(false)
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <span className="text-xs text-slate-400 block">Email</span>
        <div className="space-y-1.5">
          {/* Primary email */}
          <div className="flex items-center gap-1.5">
            <Star size={12} className="text-amber-400 flex-shrink-0" title="Principal" />
            <input
              type="email"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              placeholder="Email principal"
              className="flex-1 text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
            {showSecondary && (
              <button
                type="button"
                onClick={swapEmails}
                className="p-1 text-slate-400 hover:text-blue-600 rounded"
                title="Intercambiar principal y secundario"
              >
                <ArrowUpDown size={13} />
              </button>
            )}
          </div>

          {/* Secondary email */}
          {showSecondary && (
            <div className="flex items-center gap-1.5">
              <Mail size={12} className="text-slate-300 flex-shrink-0" />
              <input
                type="email"
                value={secondary}
                onChange={(e) => setSecondary(e.target.value)}
                placeholder="Email secundario"
                className="flex-1 text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={removeSecondary}
                className="p-1 text-slate-400 hover:text-red-500 rounded"
                title="Eliminar email secundario"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Add secondary button */}
          {!showSecondary && (
            <button
              type="button"
              onClick={() => setShowSecondary(true)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
            >
              <Plus size={12} /> Agregar otro email
            </button>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            disabled={isLoading}
            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Guardar
          </button>
          <button
            onClick={cancel}
            className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-slate-100"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  // View mode
  return (
    <div
      className="group cursor-pointer"
      onClick={startEdit}
    >
      <span className="text-xs text-slate-400 block mb-0.5">Email</span>
      {!lead.email && !lead.email_secundario ? (
        <span className="text-sm text-slate-300 italic">—</span>
      ) : (
        <div className="space-y-0.5">
          {lead.email && (
            <div className="flex items-center gap-1.5">
              <Star size={11} className="text-amber-400 flex-shrink-0" />
              <a
                href={`mailto:${lead.email}`}
                className="text-sm text-blue-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {lead.email}
              </a>
            </div>
          )}
          {lead.email_secundario && (
            <div className="flex items-center gap-1.5">
              <Mail size={11} className="text-slate-300 flex-shrink-0" />
              <a
                href={`mailto:${lead.email_secundario}`}
                className="text-sm text-blue-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {lead.email_secundario}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
