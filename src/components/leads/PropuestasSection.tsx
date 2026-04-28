'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Check, X, DollarSign } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Propuesta, Lead } from '@/types'
import { formatUSD } from '@/lib/utils'

interface PropuestasSectionProps {
  lead: Lead
  readOnly?: boolean
}

export function PropuestasSection({ lead, readOnly = false }: PropuestasSectionProps) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newPropuesta, setNewPropuesta] = useState({
    descripcion: '',
    valor: '',
    moneda: 'USD' as 'USD' | 'ARS',
  })

  const createMutation = useMutation({
    mutationFn: async (data: { descripcion: string; valor_usd?: number; valor_ars?: number; moneda: 'USD' | 'ARS' }) => {
      const res = await fetch(`/api/leads/${lead.id}/propuestas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Error al crear propuesta')
      return res.json()
    },
    onSuccess: () => {
      setShowAdd(false)
      setNewPropuesta({ descripcion: '', valor: '', moneda: 'USD' })
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] })
      toast.success('Propuesta creada')
    },
    onError: () => toast.error('Error al crear propuesta'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: Propuesta['estado'] }) => {
      const res = await fetch(`/api/propuestas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      })
      if (!res.ok) throw new Error('Error al actualizar propuesta')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] })
      toast.success('Propuesta actualizada')
    },
    onError: () => toast.error('Error al actualizar propuesta'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/propuestas/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar propuesta')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] })
      toast.success('Propuesta eliminada')
    },
    onError: () => toast.error('Error al eliminar propuesta'),
  })

  const handleCreate = () => {
    const valor = parseFloat(newPropuesta.valor) || 0
    const data: { descripcion: string; valor_usd?: number; valor_ars?: number; moneda: 'USD' | 'ARS' } = {
      descripcion: newPropuesta.descripcion,
      moneda: newPropuesta.moneda,
    }
    if (newPropuesta.moneda === 'USD') {
      data.valor_usd = valor
    } else {
      data.valor_ars = valor
    }
    createMutation.mutate(data)
  }

  const propuestas = lead.propuestas || []
  const totalAceptadas = propuestas.filter(p => p.estado === 'aceptada').reduce((sum, p) => {
    return sum + (p.valor_usd || 0)
  }, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Propuestas</h3>
        {!readOnly && (
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus size={14} />
            Agregar
          </button>
        )}
      </div>

      {showAdd && !readOnly && (
        <div className="bg-slate-50 rounded-lg p-3 space-y-2">
          <input
            type="text"
            placeholder="Descripción de la propuesta"
            value={newPropuesta.descripcion}
            onChange={(e) => setNewPropuesta({ ...newPropuesta, descripcion: e.target.value })}
            className="w-full text-sm border rounded px-2 py-1"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Valor"
              value={newPropuesta.valor}
              onChange={(e) => setNewPropuesta({ ...newPropuesta, valor: e.target.value })}
              className="flex-1 text-sm border rounded px-2 py-1"
            />
            <select
              value={newPropuesta.moneda}
              onChange={(e) => setNewPropuesta({ ...newPropuesta, moneda: e.target.value as 'USD' | 'ARS' })}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newPropuesta.descripcion}
              className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <Check size={12} />
              Guardar
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="flex items-center gap-1 text-xs text-slate-600 px-2 py-1 rounded hover:bg-slate-100"
            >
              <X size={12} />
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {propuestas.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Sin propuestas</p>
        ) : (
          propuestas.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 p-2 rounded-lg border ${
                p.estado === 'aceptada'
                  ? 'bg-emerald-50 border-emerald-200'
                  : p.estado === 'rechazada'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{p.descripcion}</p>
                <p className="text-xs text-slate-500">
                  {p.moneda === 'USD' ? formatUSD(p.valor_usd || 0) : `ARS ${p.valor_ars?.toLocaleString('es-AR')}`}
                </p>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-1">
                  {p.estado === 'pendiente' && (
                    <>
                      <button
                        onClick={() => updateMutation.mutate({ id: p.id, estado: 'aceptada' })}
                        className="p-1 text-emerald-600 hover:bg-emerald-100 rounded"
                        title="Aceptar"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => updateMutation.mutate({ id: p.id, estado: 'rechazada' })}
                        className="p-1 text-red-600 hover:bg-red-100 rounded"
                        title="Rechazar"
                      >
                        <X size={14} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      if (confirm('¿Eliminar esta propuesta?')) {
                        deleteMutation.mutate(p.id)
                      }
                    }}
                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
              {p.estado !== 'pendiente' && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    p.estado === 'aceptada'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {p.estado === 'aceptada' ? 'Aceptada' : 'Rechazada'}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {totalAceptadas > 0 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-slate-600">Total aceptado:</span>
          <span className="text-sm font-semibold text-emerald-600">{formatUSD(totalAceptadas)}</span>
        </div>
      )}
    </div>
  )
}
