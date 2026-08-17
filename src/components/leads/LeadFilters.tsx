'use client'

import { Search, X, Download, Calendar } from 'lucide-react'
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

  const selectClass = 'h-9 text-sm border border-slate-200 rounded-lg px-3 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-700 transition-colors'

  return (
    <div className="flex flex-col gap-2.5 flex-shrink-0">
      {/* Row 1: search + primary filters + actions */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={filters.buscar}
            onChange={(e) => onFilter('buscar', e.target.value)}
            placeholder="Buscar leads..."
            className="w-full h-9 pl-8 pr-3 text-sm border border-slate-200 rounded-lg bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
          />
        </div>

        <select
          value={filters.estados[0] ?? ''}
          onChange={(e) => onFilter('estado', e.target.value)}
          className={selectClass}
        >
          <option value="">Todos los estados</option>
          {activeStages.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {users.length > 0 && (
          <select
            value={filters.responsableId}
            onChange={(e) => onFilter('responsableId', e.target.value)}
            className={selectClass}
          >
            <option value="">Todos los responsables</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        )}

        {/* Total + export + clear — pinned right */}
        <div className="flex items-center gap-2 ml-auto">
          {total != null && (
            <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-3 h-9 flex items-center whitespace-nowrap">
              {total} lead{total === 1 ? '' : 's'}
            </span>
          )}
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 text-sm font-medium text-blue-600 h-9 px-3 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 transition-colors whitespace-nowrap"
          >
            <Download size={14} />
            Exportar CSV
          </button>
          {hasActiveFilters && (
            <button
              onClick={onReset}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 h-9 px-3 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              <X size={14} />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Row 2: secondary filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <select
          value={filters.fuente}
          onChange={(e) => onFilter('fuente', e.target.value)}
          className={selectClass}
        >
          <option value="">Todas las fuentes</option>
          {FUENTES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        <select
          value={filters.idioma}
          onChange={(e) => onFilter('idioma', e.target.value)}
          className={selectClass}
        >
          <option value="">Todos los idiomas</option>
          {IDIOMAS.map((i) => (
            <option key={i.value} value={i.value}>{i.label}</option>
          ))}
        </select>

        <select
          value={filters.pais}
          onChange={(e) => onFilter('pais', e.target.value)}
          className={selectClass}
        >
          <option value="">Todos los países</option>
          {PAISES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          value={filters.servicios[0] ?? ''}
          onChange={(e) => onFilter('servicios', e.target.value ? [e.target.value] : [])}
          className={selectClass}
        >
          <option value="">Todos los servicios</option>
          {SERVICIOS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Fecha de ingreso range */}
        <div className="flex items-center gap-1.5 h-9 pl-2.5 pr-1.5 border border-slate-200 rounded-lg bg-white">
          <Calendar size={13} className="text-slate-400 flex-shrink-0" />
          <span className="text-xs text-slate-500 whitespace-nowrap">Ingresó</span>
          <input
            type="date"
            value={filters.fechaDesde}
            onChange={(e) => onFilter('fecha_desde', e.target.value)}
            className="text-sm text-slate-700 bg-transparent focus:outline-none w-[124px]"
          />
          <span className="text-slate-300">→</span>
          <input
            type="date"
            value={filters.fechaHasta}
            onChange={(e) => onFilter('fecha_hasta', e.target.value)}
            className="text-sm text-slate-700 bg-transparent focus:outline-none w-[124px]"
          />
        </div>
      </div>
    </div>
  )
}
