'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { SERVICIOS } from '@/types'

interface ServiciosEditProps {
  servicios: string[]
  onChange: (servicios: string[]) => void
  isLoading?: boolean
}

export function ServiciosEdit({ servicios, onChange, isLoading }: ServiciosEditProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState('')

  const availableServicios = SERVICIOS.filter(s => !servicios.includes(s))

  const handleAdd = () => {
    if (selected) {
      onChange([...servicios, selected])
      setSelected('')
      setShowAdd(false)
    }
  }

  const handleRemove = (servicio: string) => {
    onChange(servicios.filter(s => s !== servicio))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {servicios.map((servicio) => (
          <span
            key={servicio}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium"
          >
            {servicio}
            <button
              onClick={() => handleRemove(servicio)}
              disabled={isLoading}
              className="hover:text-blue-900 disabled:opacity-50"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {!showAdd && availableServicios.length > 0 && (
          <button
            onClick={() => setShowAdd(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <Plus size={12} />
            Agregar
          </button>
        )}
      </div>

      {showAdd && (
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="text-sm border rounded px-2 py-1"
            disabled={isLoading}
          >
            <option value="">Seleccionar servicio...</option>
            {availableServicios.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!selected || isLoading}
            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Agregar
          </button>
          <button
            onClick={() => {
              setShowAdd(false)
              setSelected('')
            }}
            className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-slate-100"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
