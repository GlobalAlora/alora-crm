'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, X } from 'lucide-react'
import { usersApi } from '@/lib/api'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { cn } from '@/lib/utils'

interface DashboardFiltersProps {
  fechaDesde: string
  fechaHasta: string
  responsableId: string
  onFechaDesdeChange: (value: string) => void
  onFechaHastaChange: (value: string) => void
  onResponsableChange: (id: string) => void
}

export function DashboardFilters({
  fechaDesde,
  fechaHasta,
  responsableId,
  onFechaDesdeChange,
  onFechaHastaChange,
  onResponsableChange,
}: DashboardFiltersProps) {
  const [showResponsables, setShowResponsables] = useState(false)

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    staleTime: 5 * 60 * 1000,
  })

  const selectedResponsable = users?.find((u) => u.id === responsableId)

  const hasFilters = fechaDesde || fechaHasta || responsableId

  const clearAll = () => {
    onFechaDesdeChange('')
    onFechaHastaChange('')
    onResponsableChange('')
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Fecha desde */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-500">Desde</label>
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => onFechaDesdeChange(e.target.value)}
          className="px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </div>

      {/* Fecha hasta */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-500">Hasta</label>
        <input
          type="date"
          value={fechaHasta}
          onChange={(e) => onFechaHastaChange(e.target.value)}
          className="px-2 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </div>

      {/* Filtro responsable */}
      <div className="relative">
        <button
          onClick={() => setShowResponsables(!showResponsables)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md transition-colors',
            responsableId
              ? 'bg-slate-900 text-white border-slate-900'
              : 'hover:bg-slate-50'
          )}
        >
          {selectedResponsable ? (
            <>
              <UserAvatar user={selectedResponsable} size="sm" />
              <span className="max-w-24 truncate">{selectedResponsable.full_name}</span>
            </>
          ) : (
            'Responsable'
          )}
          <ChevronDown size={14} />
        </button>

        {showResponsables && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowResponsables(false)}
            />
            <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-20 min-w-48 p-1 max-h-64 overflow-y-auto">
              <button
                onClick={() => { onResponsableChange(''); setShowResponsables(false) }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-slate-50',
                  !responsableId && 'bg-slate-50'
                )}
              >
                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs text-slate-500">
                  T
                </div>
                Todos
              </button>
              {users?.map((user) => (
                <button
                  key={user.id}
                  onClick={() => { onResponsableChange(user.id); setShowResponsables(false) }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-slate-50',
                    responsableId === user.id && 'bg-slate-50'
                  )}
                >
                  <UserAvatar user={user}
                    size="sm"
                  />
                  <span className="truncate">{user.full_name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Clear all */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700"
        >
          <X size={12} />
          Limpiar filtros
        </button>
      )}
    </div>
  )
}
