'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, RefreshCw, ChevronDown, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'

type Asistencia = 'se_presento' | 'no_se_presento' | 'reagendo' | 'cancelada_alora'

interface RescheduleData {
  fecha_reunion: string
  reunion_hora: string
  reunion_link: string
}

interface MeetingStatusCheckProps {
  leadId: string
  current: Asistencia | null
  currentFecha: string | null
  currentHora: string | null
  currentLink: string | null
  onSave: (asistencia: Asistencia, reschedule?: RescheduleData) => void
  disabled?: boolean
}

const OPTIONS: { value: Asistencia; label: string; icon: React.ReactNode; activeClass: string; borderClass: string }[] = [
  {
    value: 'se_presento',
    label: 'Se presentó',
    icon: <CheckCircle2 size={14} />,
    activeClass: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    borderClass: 'border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600',
  },
  {
    value: 'no_se_presento',
    label: 'No se presentó',
    icon: <XCircle size={14} />,
    activeClass: 'bg-red-50 text-red-700 border-red-300',
    borderClass: 'border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600',
  },
  {
    value: 'reagendo',
    label: 'Reagendó',
    icon: <RefreshCw size={14} />,
    activeClass: 'bg-amber-50 text-amber-700 border-amber-300',
    borderClass: 'border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600',
  },
  {
    value: 'cancelada_alora',
    label: 'Cancelada por ALORA',
    icon: <Ban size={14} />,
    activeClass: 'bg-slate-100 text-slate-700 border-slate-300',
    borderClass: 'border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700',
  },
]

export function MeetingStatusCheck({
  current,
  currentFecha,
  currentHora,
  currentLink,
  onSave,
  disabled,
}: MeetingStatusCheckProps) {
  const [selected, setSelected] = useState<Asistencia | null>(current)
  const [showReschedule, setShowReschedule] = useState(current === 'reagendo')
  const [saving, setSaving] = useState(false)

  // Reschedule form state
  const [newFecha, setNewFecha] = useState(currentFecha?.slice(0, 10) ?? '')
  const [newHora, setNewHora] = useState(currentHora ?? '')
  const [newLink, setNewLink] = useState(currentLink ?? '')

  const handleSelect = (value: Asistencia) => {
    if (disabled) return
    setSelected(value)
    setShowReschedule(value === 'reagendo')
  }

  const handleSave = async () => {
    if (!selected || saving) return
    setSaving(true)
    try {
      if (selected === 'reagendo') {
        await onSave(selected, {
          fecha_reunion: newFecha,
          reunion_hora: newHora,
          reunion_link: newLink,
        })
      } else {
        await onSave(selected)
      }
    } finally {
      setSaving(false)
    }
  }

  const isDirty = selected !== current || (selected === 'reagendo' && (
    newFecha !== (currentFecha?.slice(0, 10) ?? '') ||
    newHora !== (currentHora ?? '') ||
    newLink !== (currentLink ?? '')
  ))

  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
        Estado de la reunión
      </p>

      {/* 3 option buttons */}
      <div className="flex flex-col gap-1.5">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => handleSelect(opt.value)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left',
              selected === opt.value ? opt.activeClass : opt.borderClass,
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {opt.icon}
            {opt.label}
            {opt.value === 'reagendo' && (
              <ChevronDown
                size={12}
                className={cn(
                  'ml-auto transition-transform',
                  showReschedule && selected === 'reagendo' ? 'rotate-180' : ''
                )}
              />
            )}
          </button>
        ))}
      </div>

      {/* Reschedule form — shown when "reagendo" is selected */}
      {showReschedule && selected === 'reagendo' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2.5">
          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
            Nuevos datos de la reunión
          </p>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-500 font-medium">Nueva fecha</label>
            <input
              type="date"
              value={newFecha}
              onChange={(e) => setNewFecha(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-500 font-medium">Nueva hora</label>
            <input
              type="time"
              value={newHora}
              onChange={(e) => setNewHora(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-500 font-medium">Nuevo link / URL</label>
            <input
              type="url"
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              placeholder="https://..."
              className="w-full text-xs border border-slate-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
            />
          </div>
        </div>
      )}

      {/* Save button — only shown when there's a pending change */}
      {isDirty && selected && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || (selected === 'reagendo' && !newFecha)}
          className={cn(
            'w-full py-1.5 px-3 rounded-lg text-xs font-medium transition-all',
            'bg-violet-600 text-white hover:bg-violet-700 active:bg-violet-800',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {saving ? 'Guardando...' : 'Guardar estado'}
        </button>
      )}

      {/* Current status display when saved and not editing */}
      {!isDirty && current && (
        <p className="text-[10px] text-slate-400 italic">
          {current === 'se_presento' && '✅ Registrado: se presentó'}
          {current === 'no_se_presento' && '❌ Registrado: no se presentó'}
          {current === 'reagendo' && '🔄 Registrado: reagendó'}
          {current === 'cancelada_alora' && '🚫 Registrado: cancelada por ALORA'}
        </p>
      )}
    </div>
  )
}
