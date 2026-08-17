'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import type { PipelineStage } from '@/types'

export interface LeadFilterState {
  buscar: string
  estados: PipelineStage[]
  responsableId: string
  fuente: string
  pais: string
  idioma: string
  servicios: string[]
  fechaDesde: string
  fechaHasta: string
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
    fuente: searchParams.get('fuente') ?? '',
    pais: searchParams.get('pais') ?? '',
    idioma: searchParams.get('idioma') ?? '',
    servicios: searchParams.getAll('servicio') ?? [],
    fechaDesde: searchParams.get('fecha_desde') ?? '',
    fechaHasta: searchParams.get('fecha_hasta') ?? '',
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

    // Handle fuente
    if (filters.fuente) {
      params.set('fuente', filters.fuente)
    } else {
      params.delete('fuente')
    }

    // Handle pais
    if (filters.pais) {
      params.set('pais', filters.pais)
    } else {
      params.delete('pais')
    }

    // Handle idioma
    if (filters.idioma) {
      params.set('idioma', filters.idioma)
    } else {
      params.delete('idioma')
    }

    // Handle servicios
    params.delete('servicio')
    filters.servicios.forEach((s) => params.append('servicio', s))

    // Handle fecha de ingreso
    if (filters.fechaDesde) {
      params.set('fecha_desde', filters.fechaDesde)
    } else {
      params.delete('fecha_desde')
    }
    if (filters.fechaHasta) {
      params.set('fecha_hasta', filters.fechaHasta)
    } else {
      params.delete('fecha_hasta')
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedBuscar, filters.estados, filters.responsableId, filters.fuente, filters.pais, filters.idioma, filters.servicios, filters.fechaDesde, filters.fechaHasta, filters.sortBy, filters.sortOrder, pathname, router, searchParams])

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

  const setFuente = useCallback((fuente: string) => {
    setFilters((f) => ({ ...f, fuente }))
  }, [])

  const setPais = useCallback((pais: string) => {
    setFilters((f) => ({ ...f, pais }))
  }, [])

  const setIdioma = useCallback((idioma: string) => {
    setFilters((f) => ({ ...f, idioma }))
  }, [])

  const toggleServicio = useCallback((servicio: string) => {
    setFilters((f) => ({
      ...f,
      servicios: f.servicios.includes(servicio)
        ? f.servicios.filter((s) => s !== servicio)
        : [...f.servicios, servicio],
    }))
  }, [])

  const setServicios = useCallback((servicios: string[]) => {
    setFilters((f) => ({ ...f, servicios }))
  }, [])

  const setFechaDesde = useCallback((fechaDesde: string) => {
    setFilters((f) => ({ ...f, fechaDesde }))
  }, [])

  const setFechaHasta = useCallback((fechaHasta: string) => {
    setFilters((f) => ({ ...f, fechaHasta }))
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
      fuente: '',
      pais: '',
      idioma: '',
      servicios: [],
      fechaDesde: '',
      fechaHasta: '',
      sortBy: 'last_activity_at',
      sortOrder: 'desc',
    })
  }, [])

  // Query key para React Query (usa debouncedBuscar)
  const queryFilters = {
    buscar: debouncedBuscar || undefined,
    estado_pipeline: filters.estados.length > 0 ? filters.estados : undefined,
    responsable_id: filters.responsableId || undefined,
    fuente: filters.fuente || undefined,
    pais: filters.pais || undefined,
    idioma: filters.idioma || undefined,
    servicio: filters.servicios.length > 0 ? filters.servicios : undefined,
    fecha_desde: filters.fechaDesde || undefined,
    fecha_hasta: filters.fechaHasta || undefined,
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
    setFuente,
    setPais,
    setIdioma,
    toggleServicio,
    setServicios,
    setFechaDesde,
    setFechaHasta,
    setSort,
    clearAll,
    hasActiveFilters: debouncedBuscar || filters.estados.length > 0 || filters.responsableId || filters.fuente || filters.pais || filters.idioma || filters.servicios.length > 0 || filters.fechaDesde || filters.fechaHasta,
  }
}
