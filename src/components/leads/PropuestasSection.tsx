'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Check, X, DollarSign, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Propuesta, Lead, TipoPago } from '@/types'
import { formatUSD } from '@/lib/utils'

interface PropuestasSectionProps {
  lead: Lead
  readOnly?: boolean
}

type PropuestaForm = {
  descripcion: string
  valor: string
  moneda: 'USD' | 'ARS'
  tipo_pago: TipoPago
  link: string
}

const EMPTY_FORM: PropuestaForm = {
  descripcion: '',
  valor: '',
  moneda: 'USD',
  tipo_pago: 'unica_vez',
  link: '',
}

function TipoPagoToggle({ value, onChange }: { value: TipoPago; onChange: (v: TipoPago) => void }) {
  return (
    <div className="flex gap-1 p-0.5 bg-slate-200 rounded-lg w-fit">
      {(['unica_vez', 'mensual'] as TipoPago[]).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`text-xs px-3 py-1 rounded-md transition-colors ${
            value === opt ? 'bg-white text-slate-800 shadow-sm font-medium' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          {opt === 'unica_vez' ? 'Única vez' : 'Mensual'}
        </button>
      ))}
    </div>
  )
}

function PropuestaFormFields({
  form,
  onChange,
}: {
  form: PropuestaForm
  onChange: (patch: Partial<PropuestaForm>) => void
}) {
  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Descripción de la propuesta"
        value={form.descripcion}
        onChange={(e) => onChange({ descripcion: e.target.value })}
        className="w-full text-sm border rounded px-2 py-1"
      />
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Valor"
          value={form.valor}
          onChange={(e) => onChange({ valor: e.target.value })}
          className="flex-1 text-sm border rounded px-2 py-1"
        />
        <select
          value={form.moneda}
          onChange={(e) => onChange({ moneda: e.target.value as 'USD' | 'ARS' })}
          className="text-sm border rounded px-2 py-1"
        >
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
      </div>
      <TipoPagoToggle value={form.tipo_pago} onChange={(v) => onChange({ tipo_pago: v })} />
      <input
        type="url"
        placeholder="Link (Drive, PDF, etc.) — opcional"
        value={form.link}
        onChange={(e) => onChange({ link: e.target.value })}
        className="w-full text-sm border rounded px-2 py-1"
      />
    </div>
  )
}

export function PropuestasSection({ lead, readOnly = false }: PropuestasSectionProps) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newForm, setNewForm] = useState<PropuestaForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<PropuestaForm>(EMPTY_FORM)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['lead', lead.id] })
    queryClient.invalidateQueries({ queryKey: ['propuestas-count', lead.id] })
  }

  const createMutation = useMutation({
    mutationFn: async (data: object) => {
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
      setNewForm(EMPTY_FORM)
      invalidate()
      toast.success('Propuesta creada')
    },
    onError: () => toast.error('Error al crear propuesta'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & object) => {
      const res = await fetch(`/api/propuestas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Error al actualizar propuesta')
      return res.json()
    },
    onSuccess: () => {
      setEditingId(null)
      invalidate()
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
      invalidate()
      toast.success('Propuesta eliminada')
    },
    onError: () => toast.error('Error al eliminar propuesta'),
  })

  const buildPayload = (form: PropuestaForm) => {
    const valor = parseFloat(form.valor) || 0
    return {
      descripcion: form.descripcion,
      moneda: form.moneda,
      tipo_pago: form.tipo_pago,
      valor_usd: form.moneda === 'USD' ? valor : undefined,
      valor_ars: form.moneda === 'ARS' ? valor : undefined,
      link: form.link || undefined,
    }
  }

  const startEdit = (p: Propuesta) => {
    setEditingId(p.id)
    setEditForm({
      descripcion: p.descripcion,
      valor: String(p.moneda === 'USD' ? (p.valor_usd ?? '') : (p.valor_ars ?? '')),
      moneda: p.moneda,
      tipo_pago: p.tipo_pago,
      link: p.link ?? '',
    })
  }

  const propuestas = lead.propuestas || []
  const totalAceptadas = propuestas.filter(p => p.estado === 'aceptada').reduce((sum, p) => sum + (p.valor_usd || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Propuestas</h3>
        {!readOnly && (
          <button
            onClick={() => { setShowAdd(!showAdd); setEditingId(null) }}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Plus size={14} />
            Agregar
          </button>
        )}
      </div>

      {/* ── Formulario de nueva propuesta ── */}
      {showAdd && !readOnly && (
        <div className="bg-slate-50 rounded-lg p-3 space-y-2">
          <PropuestaFormFields form={newForm} onChange={(p) => setNewForm(prev => ({ ...prev, ...p }))} />
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate(buildPayload(newForm))}
              disabled={createMutation.isPending || !newForm.descripcion}
              className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <Check size={12} /> Guardar
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="flex items-center gap-1 text-xs text-slate-600 px-2 py-1 rounded hover:bg-slate-100"
            >
              <X size={12} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Lista de propuestas ── */}
      <div className="space-y-2">
        {propuestas.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Sin propuestas</p>
        ) : (
          propuestas.map((p) => (
            <div key={p.id}>
              {/* ── Modo edición ── */}
              {editingId === p.id ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                  <PropuestaFormFields form={editForm} onChange={(patch) => setEditForm(prev => ({ ...prev, ...patch }))} />
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateMutation.mutate({ id: p.id, ...buildPayload(editForm) })}
                      disabled={updateMutation.isPending || !editForm.descripcion}
                      className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Check size={12} /> Guardar
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex items-center gap-1 text-xs text-slate-600 px-2 py-1 rounded hover:bg-slate-100"
                    >
                      <X size={12} /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Modo vista ── */
                <div
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-slate-500">
                        {p.moneda === 'USD' ? formatUSD(p.valor_usd || 0) : `ARS ${p.valor_ars?.toLocaleString('es-AR')}`}
                      </p>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        p.tipo_pago === 'mensual' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {p.tipo_pago === 'mensual' ? 'Mensual' : 'Única vez'}
                      </span>
                      {p.estado !== 'pendiente' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          p.estado === 'aceptada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {p.estado === 'aceptada' ? 'Aceptada' : 'Rechazada'}
                        </span>
                      )}
                    </div>
                    {p.link && (
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline truncate block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Ver propuesta ↗
                      </a>
                    )}
                  </div>

                  {!readOnly && (
                    <div className="flex items-center gap-1 flex-shrink-0">
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
                            className="p-1 text-red-500 hover:bg-red-100 rounded"
                            title="Rechazar"
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => startEdit(p)}
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded"
                        title="Editar"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => { if (confirm('¿Eliminar esta propuesta?')) deleteMutation.mutate(p.id) }}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {totalAceptadas > 0 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-slate-600">Total aceptado:</span>
          <span className="text-sm font-semibold text-emerald-600 flex items-center gap-1">
            <DollarSign size={13} />
            {formatUSD(totalAceptadas)}
          </span>
        </div>
      )}
    </div>
  )
}
