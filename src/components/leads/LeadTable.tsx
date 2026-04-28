'use client'

import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Lead } from '@/types'
import { leadsApi } from '@/lib/api'
import { formatUSD, timeAgo } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { LeadFilters } from './LeadFilters'
import { useLeadFilters } from '@/hooks/useLeadFilters'
import { BulkActionsBar } from './BulkActionsBar'
import { cn } from '@/lib/utils'

type SortColumn = 'nombre' | 'empresa' | 'valor_propuesta_usd' | 'last_activity_at' | 'created_at'

interface LeadTableProps {
  onLeadClick: (lead: Lead) => void
}

function SortIcon({ column, sortBy, sortOrder }: { column: SortColumn; sortBy: SortColumn; sortOrder: 'asc' | 'desc' }) {
  if (sortBy !== column) return <span className="w-3.5 h-3.5" />
  return sortOrder === 'asc' ? (
    <ChevronUp size={14} className="text-slate-700" />
  ) : (
    <ChevronDown size={14} className="text-slate-700" />
  )
}

interface SortHeaderProps {
  column: SortColumn
  sortBy: SortColumn
  sortOrder: 'asc' | 'desc'
  onSort: (column: SortColumn) => void
  children: React.ReactNode
  className?: string
}

function SortHeader({ column, sortBy, sortOrder, onSort, children, className }: SortHeaderProps) {
  return (
    <th
      onClick={() => onSort(column)}
      className={cn(
        'text-left font-medium text-slate-600 px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none',
        className
      )}
    >
      <div className="flex items-center gap-1">
        {children}
        <SortIcon column={column} sortBy={sortBy} sortOrder={sortOrder} />
      </div>
    </th>
  )
}

export function LeadTable({ onLeadClick }: LeadTableProps) {
  const {
    filters,
    queryFilters,
    setBuscar,
    toggleEstado,
    clearEstados,
    setResponsableId,
    setSort,
    clearAll,
    hasActiveFilters,
  } = useLeadFilters()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['leads', { view: 'list', ...queryFilters }],
    queryFn: () => leadsApi.list({ view: 'list', limit: 100, ...queryFilters }),
    staleTime: 30_000,
  })

  const leads = useMemo(() => data?.data ?? [], [data])
  const isAllSelected = leads.length > 0 && selectedIds.size === leads.length

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)))
    }
  }, [isAllSelected, leads])

  const handleSort = (column: SortColumn) => {
    setSort(column)
  }

  return (
    <div className="space-y-3">
      {/* Filters toolbar */}
      <LeadFilters
        buscar={filters.buscar}
        onBuscarChange={setBuscar}
        estados={filters.estados}
        onToggleEstado={toggleEstado}
        onClearEstados={clearEstados}
        responsableId={filters.responsableId}
        onResponsableChange={setResponsableId}
        hasActiveFilters={hasActiveFilters}
        onClearAll={clearAll}
      />

      {/* Bulk actions bar */}
      <BulkActionsBar
        selectedIds={Array.from(selectedIds)}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleAll}
                  className="rounded border-slate-300"
                />
              </th>
              <SortHeader column="nombre" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Nombre</SortHeader>
              <SortHeader column="empresa" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Empresa</SortHeader>
              <th className="text-left font-medium text-slate-600 px-4 py-3">Servicio</th>
              <th className="text-left font-medium text-slate-600 px-4 py-3">Etapa</th>
              <SortHeader column="valor_propuesta_usd" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort} className="text-right">Valor USD</SortHeader>
              <th className="text-left font-medium text-slate-600 px-4 py-3">Responsable</th>
              <SortHeader column="last_activity_at" sortBy={filters.sortBy} sortOrder={filters.sortOrder} onSort={handleSort}>Última actividad</SortHeader>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b last:border-b-0">
                  <td colSpan={8} className="h-14 animate-pulse bg-slate-50" />
                </tr>
              ))
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  {hasActiveFilters ? 'No se encontraron leads con esos filtros' : 'No hay leads'}
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  className={cn(
                    'border-b last:border-b-0 hover:bg-slate-50 transition-colors',
                    selectedIds.has(lead.id) && 'bg-blue-50 hover:bg-blue-100'
                  )}
                >
                  <td
                    className="px-3 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(lead.id)}
                      onChange={() => toggleSelection(lead.id)}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td
                    className="px-4 py-3 cursor-pointer"
                    onClick={() => onLeadClick(lead)}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{lead.nombre}</p>
                      {lead.email && (
                        <p className="text-xs text-slate-500 truncate">{lead.email}</p>
                      )}
                    </div>
                  </td>
                  <td
                    className="px-4 py-3 text-slate-600 cursor-pointer"
                    onClick={() => onLeadClick(lead)}
                  >
                    <span className="truncate block">{lead.empresa ?? '—'}</span>
                  </td>
                  <td
                    className="px-4 py-3 text-slate-600 cursor-pointer"
                    onClick={() => onLeadClick(lead)}
                  >
                    <span className="truncate block">{lead.servicio_interesado ?? '—'}</span>
                  </td>
                  <td
                    className="px-4 py-3 cursor-pointer"
                    onClick={() => onLeadClick(lead)}
                  >
                    <StatusBadge stage={lead.estado_pipeline} />
                  </td>
                  <td
                    className="px-4 py-3 text-right text-slate-600 cursor-pointer"
                    onClick={() => onLeadClick(lead)}
                  >
                    {lead.valor_propuesta_usd ? formatUSD(lead.valor_propuesta_usd) : '—'}
                  </td>
                  <td
                    className="px-4 py-3 cursor-pointer"
                    onClick={() => onLeadClick(lead)}
                  >
                    {lead.responsable ? (
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          name={lead.responsable.full_name}
                          avatarUrl={lead.responsable.avatar_url}
                          size="sm"
                        />
                        <span className="text-slate-600 truncate">{lead.responsable.full_name}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-slate-500 text-xs cursor-pointer"
                    onClick={() => onLeadClick(lead)}
                  >
                    {timeAgo(lead.last_activity_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Results count */}
      {data && (
        <p className="text-xs text-slate-500">
          Mostrando {leads.length} de {data.meta.total} leads
        </p>
      )}
    </div>
  )
}
