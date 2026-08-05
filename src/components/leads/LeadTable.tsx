'use client'

import { useState, useCallback } from 'react'
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
  if (sortBy !== column) return <span className="w-3.5 h-3.5 inline-block" />
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
        'text-left font-medium text-slate-600 px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors select-none text-xs uppercase tracking-wide',
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
    setResponsableId,
    setFuente,
    setPais,
    setIdioma,
    toggleServicio,
    setServicios,
    clearAll,
    hasActiveFilters,
  } = useLeadFilters()

  // Unified setFilter adapter for LeadFilters component
  // Always reset to page 1 on any filter change to avoid stale pagination
  const setFilter = (key: string, value: unknown) => {
    setPage(1)
    if (key === 'buscar') setBuscar(value as string)
    else if (key === 'estado') toggleEstado(value as import('@/types').PipelineStage)
    else if (key === 'responsableId') setResponsableId(value as string)
    else if (key === 'fuente') setFuente(value as string)
    else if (key === 'pais') setPais(value as string)
    else if (key === 'idioma') setIdioma(value as string)
    else if (key === 'servicio') toggleServicio(value as string)
    else if (key === 'servicios') setServicios(value as string[])
  }
  const resetFilters = () => {
    setPage(1)
    clearAll()
  }

  const handleExport = () => {
    const params = new URLSearchParams()
    Object.entries(queryFilters).forEach(([k, v]) => {
      if (v === undefined || v === '') return
      if (Array.isArray(v)) v.forEach((val) => params.append(k, String(val)))
      else params.set(k, String(v))
    })
    window.location.href = `/api/leads/export?${params}`
  }

  const [sortBy, setSortBy]       = useState<SortColumn>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [page, setPage]           = useState(1)
  const limit = 50

  const { data, isLoading } = useQuery({
    queryKey: ['leads', queryFilters, sortBy, sortOrder, page],
    queryFn: () => leadsApi.list({ ...queryFilters, sort_by: sortBy, sort_order: sortOrder, page, limit }),
    staleTime: 30_000,
  })

  const leads = data?.data ?? []
  const total = data?.meta?.total ?? 0
  const pages = data?.meta?.total_pages ?? 1

  const handleSort = useCallback((col: SortColumn) => {
    if (col === sortBy) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortOrder('asc')
    }
    setPage(1)
  }, [sortBy])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id)))
  }

  const sortProps = { sortBy, sortOrder, onSort: handleSort }

  return (
    <div className="flex flex-col h-full gap-3">
      <LeadFilters
        filters={filters}
        onFilter={setFilter}
        onReset={resetFilters}
        onExport={handleExport}
        hasActiveFilters={hasActiveFilters}
        total={total}
      />

      {selected.size > 0 && (
        <BulkActionsBar
          selectedIds={[...selected]}
          onClear={() => setSelected(new Set())}
        />
      )}

      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={leads.length > 0 && selected.size === leads.length}
                  onChange={toggleAll}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <SortHeader column="nombre"              {...sortProps}>Nombre</SortHeader>
              <SortHeader column="empresa"             {...sortProps} className="hidden md:table-cell">Empresa</SortHeader>
              <th className="text-left font-medium text-slate-600 px-4 py-3 text-xs uppercase tracking-wide hidden lg:table-cell">Estado</th>
              <SortHeader column="valor_propuesta_usd" {...sortProps} className="hidden lg:table-cell">Valor</SortHeader>
              <SortHeader column="last_activity_at"    {...sortProps} className="hidden xl:table-cell">Últ. actividad</SortHeader>
              <SortHeader column="created_at"          {...sortProps} className="hidden xl:table-cell">Ingresó</SortHeader>
              <th className="text-left font-medium text-slate-600 px-4 py-3 text-xs uppercase tracking-wide hidden md:table-cell">Responsable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 w-4 bg-slate-200 rounded" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-32" /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-slate-200 rounded w-24" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 rounded w-20" /></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                  <td className="px-4 py-3 hidden xl:table-cell"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                  <td className="px-4 py-3 hidden xl:table-cell"><div className="h-4 bg-slate-200 rounded w-16" /></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-slate-200 rounded w-20" /></td>
                </tr>
              ))
            )}
            {!isLoading && leads.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">
                  {hasActiveFilters ? 'Sin resultados para los filtros aplicados.' : 'No hay leads todavía.'}
                </td>
              </tr>
            )}
            {!isLoading && leads.map((lead) => {
              const isSelected = selected.has(lead.id)
              const valor = lead.valor_propuesta_usd
                ? formatUSD(lead.valor_propuesta_usd)
                : lead.valor_propuesta_ars
                  ? `ARS ${lead.valor_propuesta_ars.toLocaleString('es-AR')}`
                  : '—'
              return (
                <tr
                  key={lead.id}
                  onClick={() => onLeadClick(lead)}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-blue-50/50',
                    isSelected && 'bg-blue-50'
                  )}
                >
                  <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); toggleSelect(lead.id) }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(lead.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {lead.nombre}{lead.apellido ? ` ${lead.apellido}` : ''}
                    </div>
                    {lead.email && (
                      <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[180px]">{lead.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-600">
                    {lead.empresa || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <StatusBadge stage={lead.estado_pipeline} />
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-slate-700 font-medium tabular-nums">
                    {valor}
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell text-slate-400 text-xs">
                    {lead.last_activity_at ? timeAgo(lead.last_activity_at) : '—'}
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell text-slate-400 text-xs">
                    {timeAgo(lead.created_at)}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {lead.responsable
                      ? <UserAvatar user={lead.responsable} size="sm" showName />
                      : <span className="text-slate-300 text-xs">—</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500 flex-shrink-0">
          <span>{total} leads en total</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="px-2">Página {page} de {pages}</span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
