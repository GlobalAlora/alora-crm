'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Plus, Receipt, TrendingUp, Clock, AlertTriangle, FileText,
  Loader2, ChevronRight,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Invoice, InvoiceEstado } from '@/types'

// ─── helpers ──────────────────────────────────────────────
const ESTADO_CFG: Record<InvoiceEstado, { label: string; color: string; dot: string }> = {
  borrador:             { label: 'Borrador',          color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400'   },
  enviada:              { label: 'Enviada',            color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500'    },
  parcialmente_pagada:  { label: 'Parcial',            color: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500'   },
  pagada:               { label: 'Pagada',             color: 'bg-green-100 text-green-700',   dot: 'bg-green-500'   },
  vencida:              { label: 'Vencida',            color: 'bg-red-100 text-red-700',       dot: 'bg-red-500'     },
  cancelada:            { label: 'Cancelada',          color: 'bg-slate-100 text-slate-400',   dot: 'bg-slate-300'   },
}

const TABS: { value: string; label: string }[] = [
  { value: 'all',                label: 'Todas'     },
  { value: 'enviada',            label: 'Enviadas'  },
  { value: 'parcialmente_pagada',label: 'Parcial'   },
  { value: 'pagada',             label: 'Pagadas'   },
  { value: 'vencida',            label: 'Vencidas'  },
  { value: 'borrador',           label: 'Borradores'},
]

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

async function fetchInvoices(): Promise<{ data: Invoice[] }> {
  const r = await fetch('/api/invoices')
  if (!r.ok) throw new Error('Error al cargar facturas')
  return r.json()
}

// ─── New Invoice Modal ─────────────────────────────────────
interface NewInvoiceForm {
  cliente_nombre: string
  cliente_email: string
  project_id: string
  moneda: 'USD' | 'ARS'
  fecha_emision: string
  fecha_vencimiento: string
  descripcion: string
  notas: string
  items: { descripcion: string; cantidad: number; precio_unitario: number }[]
  payments: { descripcion: string; monto: number; fecha_vencimiento: string }[]
}

async function fetchProjects(): Promise<{ data: { id: string; nombre: string }[] }> {
  const r = await fetch('/api/projects')
  if (!r.ok) return { data: [] }
  return r.json()
}

async function createInvoice(body: Partial<NewInvoiceForm>) {
  const r = await fetch('/api/invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? 'Error al crear factura')
  return j
}

// ─── Page ─────────────────────────────────────────────────
export default function BillingPage() {
  const router = useRouter()
  const qc     = useQueryClient()
  const [tab, setTab]         = useState('all')
  const [showModal, setShowModal] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices'],
    queryFn:  fetchInvoices,
    retry:    false,
  })

  // Redirect viewers (API returns 403)
  useEffect(() => {
    if (error) router.push('/projects')
  }, [error, router])

  if (error) return null

  const invoices = data?.data ?? []

  const filtered = tab === 'all' ? invoices : invoices.filter(i => i.estado === tab)

  // Dashboard stats (USD only for simplicity — mixed currencies shown separately)
  const usdInvoices = invoices.filter(i => i.moneda === 'USD' && i.estado !== 'cancelada')
  const arsInvoices = invoices.filter(i => i.moneda === 'ARS' && i.estado !== 'cancelada')

  function statsFor(list: Invoice[]) {
    return {
      facturado: list.filter(i => i.estado === 'pagada').reduce((s, i) => s + (i.total ?? 0), 0),
      pendiente: list.filter(i => ['enviada','parcialmente_pagada'].includes(i.estado)).reduce((s, i) => s + ((i.total ?? 0) - (i.total_pagado ?? 0)), 0),
      vencido:   list.filter(i => i.estado === 'vencida').reduce((s, i) => s + ((i.total ?? 0) - (i.total_pagado ?? 0)), 0),
    }
  }

  const usdStats = statsFor(usdInvoices)
  const arsStats = statsFor(arsInvoices)

  const create = useMutation({
    mutationFn: createInvoice,
    onSuccess: (res) => {
      toast.success(`Factura ${res.data.numero} creada`)
      qc.invalidateQueries({ queryKey: ['invoices'] })
      setShowModal(false)
      router.push(`/billing/${res.data.id}`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Receipt size={20} className="text-blue-600" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Facturación</h1>
            <p className="text-sm text-slate-500">{invoices.length} factura{invoices.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} />
          Nueva factura
        </button>
      </div>

      {/* Stats */}
      <div className="px-6 py-4 border-b bg-slate-50 flex-shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* USD */}
          <StatCard icon={TrendingUp} label="Cobrado USD"  value={fmt(usdStats.facturado, 'USD')} color="text-green-600"  />
          <StatCard icon={Clock}       label="Pendiente USD" value={fmt(usdStats.pendiente, 'USD')} color="text-blue-600"   />
          <StatCard icon={AlertTriangle} label="Vencido USD" value={fmt(usdStats.vencido, 'USD')}   color="text-red-500"    />
          {/* ARS (only if there are ARS invoices) */}
          {arsInvoices.length > 0 && (
            <>
              <StatCard icon={TrendingUp}   label="Cobrado ARS"   value={fmt(arsStats.facturado, 'ARS')} color="text-green-600" />
              <StatCard icon={Clock}         label="Pendiente ARS" value={fmt(arsStats.pendiente, 'ARS')} color="text-blue-600"  />
              <StatCard icon={AlertTriangle} label="Vencido ARS"   value={fmt(arsStats.vencido, 'ARS')}   color="text-red-500"   />
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 border-b bg-white flex gap-1 flex-shrink-0 overflow-x-auto">
        {TABS.map(t => {
          const count = t.value === 'all'
            ? invoices.length
            : invoices.filter(i => i.estado === t.value).length
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5',
                tab === t.value
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              {t.label}
              {count > 0 && (
                <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <FileText size={32} className="text-slate-200" />
            <p className="text-slate-400 text-sm">No hay facturas</p>
            <button
              onClick={() => setShowModal(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              Crear primera factura
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Número</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Cliente</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Proyecto</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Emisión</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Vencimiento</th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">Total</th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-3">Cobrado</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const cfg    = ESTADO_CFG[inv.estado]
                  const total  = inv.total ?? 0
                  const cobrado = inv.total_pagado ?? 0
                  const pct    = total > 0 ? Math.round((cobrado / total) * 100) : 0
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => router.push(`/billing/${inv.id}`)}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 font-mono text-slate-700 font-medium">{inv.numero}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 leading-tight">{inv.cliente_nombre}</p>
                        {inv.cliente_email && <p className="text-xs text-slate-400">{inv.cliente_email}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {inv.project ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: inv.project.color }} />
                            {inv.project.nombre}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {format(new Date(inv.fecha_emision), 'd MMM yyyy', { locale: es })}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {inv.fecha_vencimiento
                          ? format(new Date(inv.fecha_vencimiento), 'd MMM yyyy', { locale: es })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-800 font-medium whitespace-nowrap">
                        {fmt(total, inv.moneda)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-mono text-xs text-slate-600">{fmt(cobrado, inv.moneda)}</span>
                          <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all',
                                pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-200'
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', cfg.color)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight size={14} className="text-slate-300 ml-auto" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <NewInvoiceModal
          onClose={() => setShowModal(false)}
          onSubmit={(data) => create.mutate(data)}
          isLoading={create.isPending}
        />
      )}
    </div>
  )
}

// ─── Stat Card ─────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string; color: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
      <div className={cn('p-2 rounded-lg bg-slate-50')}>
        <Icon size={16} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 leading-none mb-0.5">{label}</p>
        <p className="text-base font-semibold text-slate-800 font-mono leading-tight truncate">{value}</p>
      </div>
    </div>
  )
}

// ─── New Invoice Modal ─────────────────────────────────────
function NewInvoiceModal({
  onClose, onSubmit, isLoading,
}: {
  onClose: () => void
  onSubmit: (data: Partial<NewInvoiceForm>) => void
  isLoading: boolean
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState<NewInvoiceForm>({
    cliente_nombre:    '',
    cliente_email:     '',
    project_id:        '',
    moneda:            'USD',
    fecha_emision:     today,
    fecha_vencimiento: '',
    descripcion:       '',
    notas:             '',
    items:    [{ descripcion: '', cantidad: 1, precio_unitario: 0 }],
    payments: [],
  })

  const { data: projData } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
  const projects = projData?.data ?? []

  const total = form.items.reduce((s, it) => s + (it.cantidad * it.precio_unitario), 0)

  function setItem(idx: number, key: keyof typeof form.items[number], value: string | number) {
    setForm(f => ({
      ...f,
      items: f.items.map((it, i) => i === idx ? { ...it, [key]: value } : it),
    }))
  }

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { descripcion: '', cantidad: 1, precio_unitario: 0 }] }))
  }

  function removeItem(idx: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  function addPayment() {
    setForm(f => ({
      ...f,
      payments: [...f.payments, { descripcion: `Cuota ${f.payments.length + 1}`, monto: 0, fecha_vencimiento: '' }],
    }))
  }

  function setPayment(idx: number, key: keyof typeof form.payments[number], value: string | number) {
    setForm(f => ({
      ...f,
      payments: f.payments.map((p, i) => i === idx ? { ...p, [key]: value } : p),
    }))
  }

  function removePayment(idx: number) {
    setForm(f => ({ ...f, payments: f.payments.filter((_, i) => i !== idx) }))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.cliente_nombre.trim()) return
    onSubmit({
      ...form,
      project_id:        form.project_id || undefined,
      cliente_email:     form.cliente_email || undefined,
      descripcion:       form.descripcion || undefined,
      fecha_vencimiento: form.fecha_vencimiento || undefined,
      notas:             form.notas || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-900">Nueva factura</h2>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Client info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cliente *</label>
              <input
                required
                type="text"
                value={form.cliente_nombre}
                onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value }))}
                placeholder="Nombre del cliente"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email (opcional)</label>
              <input
                type="email"
                value={form.cliente_email}
                onChange={e => setForm(f => ({ ...f, cliente_email: e.target.value }))}
                placeholder="cliente@email.com"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Proyecto</label>
              <select
                value={form.project_id}
                onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sin proyecto</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Moneda</label>
              <select
                value={form.moneda}
                onChange={e => setForm(f => ({ ...f, moneda: e.target.value as 'USD' | 'ARS' }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Vencimiento</label>
              <input
                type="date"
                value={form.fecha_vencimiento}
                onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-700">Ítems</label>
              <button type="button" onClick={addItem} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Plus size={11} /> Agregar ítem
              </button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={it.descripcion}
                    onChange={e => setItem(idx, 'descripcion', e.target.value)}
                    placeholder="Descripción"
                    className="col-span-6 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={it.cantidad}
                    onChange={e => setItem(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                    placeholder="Cant."
                    className="col-span-2 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={it.precio_unitario}
                    onChange={e => setItem(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                    placeholder="Precio"
                    className="col-span-3 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={form.items.length === 1}
                    className="col-span-1 text-slate-300 hover:text-red-400 transition-colors disabled:opacity-30 text-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2">
              <span className="text-sm font-semibold text-slate-700">
                Total: {form.moneda} {total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Payment schedule */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-700">Cuotas / Plan de pago</label>
              <button type="button" onClick={addPayment} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Plus size={11} /> Agregar cuota
              </button>
            </div>
            {form.payments.length === 0 && (
              <p className="text-xs text-slate-400 italic">Sin cuotas — el cliente puede pagar todo junto</p>
            )}
            <div className="space-y-2">
              {form.payments.map((p, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={p.descripcion}
                    onChange={e => setPayment(idx, 'descripcion', e.target.value)}
                    placeholder="Descripción cuota"
                    className="col-span-5 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={p.monto}
                    onChange={e => setPayment(idx, 'monto', parseFloat(e.target.value) || 0)}
                    placeholder="Monto"
                    className="col-span-3 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="date"
                    value={p.fecha_vencimiento}
                    onChange={e => setPayment(idx, 'fecha_vencimiento', e.target.value)}
                    className="col-span-3 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => removePayment(idx)}
                    className="col-span-1 text-slate-300 hover:text-red-400 transition-colors text-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notas internas</label>
            <textarea
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              rows={2}
              placeholder="Notas internas..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </form>

        <div className="px-6 py-4 border-t flex gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={(e) => { e.preventDefault(); if (form.cliente_nombre.trim()) { onSubmit({ ...form, project_id: form.project_id || undefined }) } }}
            disabled={isLoading || !form.cliente_nombre.trim()}
            className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Crear factura
          </button>
        </div>
      </div>
    </div>
  )
}
