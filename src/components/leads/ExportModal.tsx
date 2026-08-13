'use client'

import { useState } from 'react'
import { X, Download } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usersApi } from '@/lib/api'
import { PIPELINE_STAGES, FUENTES } from '@/types'
import type { PipelineStage } from '@/types'

interface ExportModalProps {
  onClose: () => void
}

const ZONES = [
  { key: 'entrada',  label: 'Entrada'  },
  { key: 'gestion',  label: 'Gestión'  },
  { key: 'cierre',   label: 'Cierre'   },
] as const

export function ExportModal({ onClose }: ExportModalProps) {
  const [fechaDesde,     setFechaDesde]     = useState('')
  const [fechaHasta,     setFechaHasta]     = useState('')
  const [stages,         setStages]         = useState<Set<PipelineStage>>(new Set())
  const [responsableId,  setResponsableId]  = useState('')
  const [fuente,         setFuente]         = useState('')
  const [soloConEmail,   setSoloConEmail]   = useState(false)

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    staleTime: 5 * 60_000,
  })

  const toggleStage = (s: PipelineStage) => {
    setStages(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const toggleZone = (zone: string) => {
    const zoneStages = PIPELINE_STAGES.filter(s => s.zone === zone).map(s => s.value)
    const allSelected = zoneStages.every(s => stages.has(s))
    setStages(prev => {
      const next = new Set(prev)
      zoneStages.forEach(s => allSelected ? next.delete(s) : next.add(s))
      return next
    })
  }

  const handleExport = () => {
    const params = new URLSearchParams()
    if (fechaDesde)    params.set('fecha_desde', fechaDesde)
    if (fechaHasta)    params.set('fecha_hasta', fechaHasta + 'T23:59:59')
    stages.forEach(s  => params.append('estado_pipeline', s))
    if (responsableId) params.set('responsable_id', responsableId)
    if (fuente)        params.set('fuente', fuente)
    if (soloConEmail)  params.set('solo_con_email', 'true')
    window.location.href = `/api/leads/export?${params}`
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">Exportar leads</h2>
            <p className="text-xs text-slate-400 mt-0.5">Configurá los filtros antes de exportar</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-6">

          {/* Fechas */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Fecha de ingreso</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Desde</label>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={e => setFechaDesde(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Hasta</label>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={e => setFechaHasta(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Pipeline stages */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Etapas del pipeline</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setStages(new Set(PIPELINE_STAGES.map(s => s.value)))}
                  className="text-[11px] text-blue-600 hover:underline"
                >
                  Todas
                </button>
                <span className="text-slate-300">·</span>
                <button
                  onClick={() => setStages(new Set())}
                  className="text-[11px] text-slate-400 hover:underline"
                >
                  Ninguna
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">Sin selección = exporta todas las etapas</p>

            <div className="space-y-4">
              {ZONES.map(zone => {
                const zoneStages = PIPELINE_STAGES.filter(s => s.zone === zone.key)
                const allSel = zoneStages.every(s => stages.has(s.value))
                const someSel = zoneStages.some(s => stages.has(s.value))
                return (
                  <div key={zone.key}>
                    <button
                      onClick={() => toggleZone(zone.key)}
                      className="flex items-center gap-2 mb-2 group"
                    >
                      <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-white text-[9px] transition-colors ${
                        allSel ? 'bg-blue-500 border-blue-500' :
                        someSel ? 'bg-blue-200 border-blue-300' :
                        'border-slate-300 bg-white'
                      }`}>
                        {allSel ? '✓' : someSel ? '–' : ''}
                      </span>
                      <span className="text-xs font-medium text-slate-600 group-hover:text-slate-800">{zone.label}</span>
                    </button>
                    <div className="ml-5 grid grid-cols-2 gap-1.5">
                      {zoneStages.map(s => (
                        <label key={s.value} className="flex items-center gap-2 cursor-pointer group">
                          <span className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border text-white text-[9px] transition-colors ${
                            stages.has(s.value) ? 'bg-blue-500 border-blue-500' : 'border-slate-300 bg-white'
                          }`}>
                            {stages.has(s.value) ? '✓' : ''}
                          </span>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={stages.has(s.value)}
                            onChange={() => toggleStage(s.value)}
                          />
                          <span className="flex items-center gap-1.5 text-xs text-slate-600 group-hover:text-slate-800">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                            {s.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Otros filtros */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Otros filtros</h3>
            <div className="space-y-3">
              {users.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Responsable</label>
                  <select
                    value={responsableId}
                    onChange={e => setResponsableId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todos</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Fuente</label>
                <select
                  value={fuente}
                  onChange={e => setFuente(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todas</option>
                  {FUENTES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={soloConEmail}
                  onChange={e => setSoloConEmail(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-600">Solo leads con email</span>
              </label>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            {stages.size > 0 ? `${stages.size} etapa${stages.size !== 1 ? 's' : ''} seleccionada${stages.size !== 1 ? 's' : ''}` : 'Todas las etapas'}
            {fechaDesde || fechaHasta ? ` · ${fechaDesde || '…'} → ${fechaHasta || 'hoy'}` : ''}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download size={14} />
              Exportar CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
