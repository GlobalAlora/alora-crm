'use client'

import { Search, X, Download } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usersApi } from '@/lib/api'
import { FUENTES, PAISES, SERVICIOS, IDIOMAS } from '@/types'
import type { LeadFilterState } from '@/hooks/useLeadFilters'
import type { PipelineStage } from '@/types'
import { useActivePipelineStages } from '@/hooks/usePipelineStages'

interface LeadFiltersProps {
  filters: LeadFilterState
  onFilter: (key: string, value: unknown) => void
  onReset: () => void
  onExport: () => void
  hasActiveFilters: string | boolean | PipelineStage[] | undefined
  total?: number
}

export function LeadFilters({ filters, onFilter, onReset, onExport, hasActiveFilters, total }: LeadFiltersProps) {
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    staleTime: 5 * 60_000,
  })
  const activeStages = useActivePipelineStages()

  return (
    <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={filters.buscar}
          onChange={(e) => onFilter('buscar', e.target.value)}
          placeholder="Buscar leads..."
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Stage filter */}
      <select
        value={filters.estados[0] ?? ''}
        onChange={(e) => onFilter('estado', e.target.value)}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
      >
        <option value="">Todos los estados</option>
        {activeStages.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* Responsable filter */}
      {users.length > 0 && (
        <select
          value={filters.responsableId}
          onChange={(e) => onFilter('responsableId', e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
        >
          <option value="">Todos los responsables</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name}</option>
          ))}
        </select>
      )}

      {/* Fuente filter */}
      <select
        value={filters.fuente}
        onChange={(e) => onFilter('fuente', e.target.value)}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
      >
        <option value="">Todas las fuentes</option>
        {FUENTES.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Idioma filter */}
      <select
        value={filters.idioma}
        onChange={(e) => onFilter('idioma', e.target.value)}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
      >
        <option value="">Todos los idiomas</option>
        {IDIOMAS.map((i) => (
          <option key={i.value} value={i.value}>{i.label}</option>
        ))}
      </select>

      {/* País filter */}
      <select
        value={filters.pais}
        onChange={(e) => onFilter('pais', e.target.value)}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
      >
        <option value="">Todos los países</option>
        {PAISES.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      {/* Servicios filter — single-select: replace the array, don't toggle */}
      <select
        value={filters.servicios[0] ?? ''}
        onChange={(e) => onFilter('servicios', e.target.value ? [e.target.value] : [])}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
      >
        <option value="">Todos los servicios</option>
        {SERVICIOS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Total + export + clear */}
      <div className="flex items-center gap-2 ml-auto">
        {total != null && (
          <span className="text-xs text-slate-400">{total} leads</span>
        )}
        <button
          onClick={onExport}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200"
        >
          <Download size={12} />
          Exportar CSV
        </button>
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={12} />
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  )
}
