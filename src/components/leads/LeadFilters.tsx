'use client'

import { Search, X, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'
import { usersApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserAvatar } from '@/components/shared/UserAvatar'

interface LeadFiltersProps {
  buscar: string
  onBuscarChange: (value: string) => void
  estados: PipelineStage[]
  onToggleEstado: (estado: PipelineStage) => void
  onClearEstados: () => void
  responsableId: string
  onResponsableChange: (id: string) => void
  hasActiveFilters: boolean | string | PipelineStage[]
  onClearAll: () => void
}

export function LeadFilters({
  buscar,
  onBuscarChange,
  estados,
  onToggleEstado,
  onClearEstados,
  responsableId,
  onResponsableChange,
  hasActiveFilters,
  onClearAll,
}: LeadFiltersProps) {
  const [showEstados, setShowEstados] = useState(false)
  const [showResponsables, setShowResponsables] = useState(false)

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    staleTime: 5 * 60 * 1000,
  })

  const selectedResponsable = users?.find((u) => u.id === responsableId)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Búsqueda */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar leads..."
          value={buscar}
          onChange={(e) => onBuscarChange(e.target.value)}
          className="pl-8 pr-3 py-1.5 text-sm border rounded-md w-64 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        {buscar && (
          <button
            onClick={() => onBuscarChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Filtro etapas */}
      <div className="relative">
        <button
          onClick={() => setShowEstados(!showEstados)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md transition-colors',
            estados.length > 0
              ? 'bg-slate-900 text-white border-slate-900'
              : 'hover:bg-slate-50'
          )}
        >
          Etapas
          {estados.length > 0 && (
            <span className="ml-1 text-xs bg-white/20 px-1.5 rounded">{estados.length}</span>
          )}
          <ChevronDown size={14} />
        </button>

        {showEstados && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowEstados(false)}
            />
            <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-20 min-w-48 p-1">
              {PIPELINE_STAGES.map((stage) => (
                <button
                  key={stage.value}
                  onClick={() => onToggleEstado(stage.value)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-slate-50',
                    estados.includes(stage.value) && 'bg-slate-50'
                  )}
                >
                  <div
                    className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center',
                      estados.includes(stage.value)
                        ? 'bg-slate-900 border-slate-900'
                        : 'border-slate-300'
                    )}
                  >
                    {estados.includes(stage.value) && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path
                          d="M1 5L3.5 7.5L9 2"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <StatusBadge stage={stage.value} />
                </button>
              ))}
              {estados.length > 0 && (
                <button
                  onClick={onClearEstados}
                  className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:text-slate-700 border-t mt-1"
                >
                  Limpiar selección
                </button>
              )}
            </div>
          </>
        )}
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
              <UserAvatar
                name={selectedResponsable.full_name}
                avatarUrl={selectedResponsable.avatar_url}
                size="sm"
              />
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
                onClick={() => onResponsableChange('')}
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
                  onClick={() => onResponsableChange(user.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-slate-50',
                    responsableId === user.id && 'bg-slate-50'
                  )}
                >
                  <UserAvatar
                    name={user.full_name}
                    avatarUrl={user.avatar_url}
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
      {hasActiveFilters && (
        <button
          onClick={onClearAll}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700"
        >
          <X size={12} />
          Limpiar filtros
        </button>
      )}
    </div>
  )
}
