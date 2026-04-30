'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, ExternalLink, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { formatUSD, formatARS, timeAgo } from '@/lib/utils'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Propuesta } from '@/types'

const INPUT = 'w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

const ESTADO_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pendiente: { icon: Clock,         color: 'text-orange-500', label: 'Pendiente' },
  aceptada:  { icon: CheckCircle2,  color: 'text-green-600',  label: 'Aceptada'  },
  rechazada: { icon: XCircle,       color: 'text-red-500',    label: 'Rechazada' },
}

interface PropuestasSectionProps {
  leadId: string
  propuestas?: Propuesta[]
}

export function PropuestasSection({ leadId, propuestas: initialPropuestas }: PropuestasSectionProps) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({
    descripcion: '', valor: '', moneda: 'USD' as 'USD' | 'ARS',
    tipo_pago: 'unica_vez' as 'unica_vez' | 'mensual', link: '',
  })

  const { data: propuestas = initialPropuestas ?? [] } = useQuery({
    queryKey: ['propuestas', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/propuestas`)
      const json = await res.json()
      return (json.data ?? []) as Propuesta[]
    },
    initialData: initialPropuestas,
    staleTime: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        descripcion: form.descripcion,
        moneda: form.moneda,
        valor_usd: form.moneda === 'USD' && form.valor ? Number(form.valor) : null,
        valor_ars: form.moneda === 'ARS' && form.valor ? Number(form.valor) : null,
        tipo_pago: form.tipo_pago,
        link: form.link || null,
      }
      const res = await fetch(`/api/leads/${leadId}/propuestas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Error al crear propuesta')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['propuestas', leadId] })
      qc.invalidateQueries({ queryKey: ['lead', leadId] })
      setAdding(false)
      setForm({ descripcion: '', valor: '', moneda: 'USD', tipo_pago: 'unica_vez', link: '' })
      toast.success('Propuesta creada')
    },
    onError: () => toast.error('Error al crear propuesta'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/leads/${leadId}/propuestas/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['propuestas', leadId] })
      toast.success('Propuesta eliminada')
    },
  })

  const updateEstadoMutation = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: string }) => {
      await fetch(`/api/leads/${leadId}/propuestas/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['propuestas', leadId] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Propuestas ({propuestas.length})</h3>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          <Plus size={12} /> Nueva propuesta
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Descripción *</span>
            <input value={form.descripcion} onChange={(e) => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Desarrollo de sitio web" className={INPUT} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600">Valor</span>
              <div className="flex rounded-md overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500">
                <select
                  value={form.moneda}
                  onChange={(e) => setForm(f => ({ ...f, moneda: e.target.value as 'USD' | 'ARS' }))}
                  className="px-2 py-1.5 text-xs bg-slate-50 border-r border-slate-200 focus:outline-none"
                >
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
                <input
                  type="number" min="0" value={form.valor}
                  onChange={(e) => setForm(f => ({ ...f, valor: e.target.value }))}
                  placeholder="0" className="flex-1 px-2 py-1.5 text-sm focus:outline-none bg-white"
                />
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600">Tipo de pago</span>
              <select value={form.tipo_pago} onChange={(e) => setForm(f => ({ ...f, tipo_pago: e.target.value as 'unica_vez' | 'mensual' }))} className={INPUT}>
                <option value="unica_vez">Única vez</option>
                <option value="mensual">Mensual</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Link de propuesta</span>
            <input type="url" value={form.link} onChange={(e) => setForm(f => ({ ...f, link: e.target.value }))} placeholder="https://docs.google.com/..." className={INPUT} />
          </label>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md">Cancelar</button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.descripcion.trim() || createMutation.isPending}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Crear
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {propuestas.length === 0 && !adding && (
        <p className="text-sm text-slate-400 text-center py-6">Sin propuestas.</p>
      )}
      <div className="space-y-3">
        {propuestas.map((p) => {
          const estadoCfg = ESTADO_CONFIG[p.estado]
          const EstadoIcon = estadoCfg.icon
          const valor = p.moneda === 'USD'
            ? (p.valor_usd ? formatUSD(p.valor_usd) : '—')
            : (p.valor_ars ? formatARS(p.valor_ars) : '—')
          return (
            <div key={p.id} className="border border-slate-200 rounded-xl p-4 bg-white space-y-3 group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileText size={14} className="text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-800 truncate">{p.descripcion}</span>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(p.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold text-slate-900 tabular-nums">{valor}</span>
                <span className="text-xs text-slate-400">{p.tipo_pago === 'mensual' ? '/ mes' : 'única vez'}</span>
                {p.link && (
                  <a href={p.link} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline ml-auto">
                    <ExternalLink size={11} /> Ver propuesta
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                {(['pendiente', 'aceptada', 'rechazada'] as const).map((estado) => {
                  const cfg = ESTADO_CONFIG[estado]
                  const Icon = cfg.icon
                  return (
                    <button
                      key={estado}
                      onClick={() => updateEstadoMutation.mutate({ id: p.id, estado })}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-all',
                        p.estado === estado
                          ? cn('border-current', cfg.color)
                          : 'border-slate-200 text-slate-400 hover:border-slate-300'
                      )}
                    >
                      <Icon size={10} className={p.estado === estado ? cfg.color : ''} />
                      {cfg.label}
                    </button>
                  )
                })}
                <span className="text-xs text-slate-400 ml-auto">{timeAgo(p.created_at)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
