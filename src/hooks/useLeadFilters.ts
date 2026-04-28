'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import type { PipelineStage } from '@/types'

export interface LeadFilterState {
  buscar: string
  estados: PipelineStage[]
  responsableId: string
  sortBy: 'nombre' | 'empresa' | 'valor_propuesta_usd' | 'last_activity_at' | 'created_at'
  sortOrder: 'asc' | 'desc'
}

const DEBOUNCE_MS = 300

export function useLeadFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Parse current URL params
  const getStateFromURL = useCallback((): LeadFilterState => ({
    buscar: searchParams.get('buscar') ?? '',
    estados: searchParams.getAll('estado_pipeline') as PipelineStage[],
    responsableId: searchParams.get('responsable_id') ?? '',
    sortBy: (searchParams.get('sort_by') as LeadFilterState['sortBy']) ?? 'last_activity_at',
    sortOrder: (searchParams.get('sort_order') as 'asc' | 'desc') ?? 'desc',
  }), [searchParams])

  const [filters, setFilters] = useState<LeadFilterState>(getStateFromURL)
  const [debouncedBuscar, setDebouncedBuscar] = useState(filters.buscar)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBuscar(filters.buscar), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [filters.buscar])

  // Sync URL -> state (for back/forward navigation)
  useEffect(() => {
    setFilters(getStateFromURL())
  }, [searchParams, getStateFromURL])

  // Update URL when filters change (except debounced search)
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())

    // Handle search separately (debounced)
    if (debouncedBuscar) {
      params.set('buscar', debouncedBuscar)
    } else {
      params.delete('buscar')
    }

    // Handle multiselect estados
    params.delete('estado_pipeline')
    filters.estados.forEach((e) => params.append('estado_pipeline', e))

    // Handle responsable
    if (filters.responsableId) {
      params.set('responsable_id', filters.responsableId)
    } else {
      params.delete('responsable_id')
    }

    // Handle sort
    if (filters.sortBy !== 'last_activity_at') {
      params.set('sort_by', filters.sortBy)
    } else {
      params.delete('sort_by')
    }
    if (filters.sortOrder !== 'desc') {
      params.set('sort_order', filters.sortOrder)
    } else {
      params.delete('sort_order')
    }

    const newQuery = params.toString()
    const currentQuery = searchParams.toString()

    if (newQuery !== currentQuery) {
      router.replace(`${pathname}?${newQuery}`, { scroll: false })
    }
  }, [debouncedBuscar, filters.estados, filters.responsableId, filters.sortBy, filters.sortOrder, pathname, router, searchParams])

  const setBuscar = useCallback((buscar: string) => {
    setFilters((f) => ({ ...f, buscar }))
  }, [])

  const toggleEstado = useCallback((estado: PipelineStage) => {
    setFilters((f) => ({
      ...f,
      estados: f.estados.includes(estado)
        ? f.estados.filter((e) => e !== estado)
        : [...f.estados, estado],
    }))
  }, [])

  const clearEstados = useCallback(() => {
    setFilters((f) => ({ ...f, estados: [] }))
  }, [])

  const setResponsableId = useCallback((id: string) => {
    setFilters((f) => ({ ...f, responsableId: id }))
  }, [])

  const setSort = useCallback((column: LeadFilterState['sortBy']) => {
    setFilters((f) => ({
      ...f,
      sortBy: column,
      sortOrder: f.sortBy === column && f.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [])

  const clearAll = useCallback(() => {
    setFilters({
      buscar: '',
      estados: [],
      responsableId: '',
      sortBy: 'last_activity_at',
      sortOrder: 'desc',
    })
  }, [])

  // Query key para React Query (usa debouncedBuscar)
  const queryFilters = {
    buscar: debouncedBuscar || undefined,
    estado_pipeline: filters.estados.length > 0 ? filters.estados : undefined,
    responsable_id: filters.responsableId || undefined,
    sort_by: filters.sortBy,
    sort_order: filters.sortOrder,
  }

  return {
    filters,
    queryFilters,
    setBuscar,
    toggleEstado,
    clearEstados,
    setResponsableId,
    setSort,
    clearAll,
    hasActiveFilters: debouncedBuscar || filters.estados.length > 0 || filters.responsableId,
  }
}
