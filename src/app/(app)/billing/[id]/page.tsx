'use client'

import { useState, useRef, use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Check, Plus, Trash2, Loader2, X,
  Calendar, DollarSign, FileText, ChevronDown, Bell, BellOff,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn, parseLocalDate, getDaysUntil, downloadHref } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Invoice, Payment, InvoiceEstado, PaymentMetodo, TicketAttachment } from '@/types'

// ─── helpers ──────────────────────────────────────────────
const ESTADO_CFG: Record<InvoiceEstado, { label: string; color: string }> = {
  pendiente:  { label: 'Pendiente', color: 'bg-slate-100 text-slate-600 border-slate-200'  },
  parcial:    { label: 'Parcial',   color: 'bg-amber-100 text-amber-700 border-amber-200'  },
  cobrado:    { label: 'Cobrado',   color: 'bg-green-100 text-green-700 border-green-200'  },
  vencido:    { label: 'Vencido',   color: 'bg-red-100 text-red-700 border-red-200'        },
  cancelada:  { label: 'Cancelada', color: 'bg-slate-100 text-slate-400 border-slate-200'  },
}

const ESTADOS: InvoiceEstado[] = ['pendiente', 'parcial', 'cobrado', 'vencido', 'cancelada']

const METODOS: { value: PaymentMetodo; label: string }[] = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo',      label: 'Efectivo'      },
  { value: 'mercadopago',   label: 'MercadoPago'   },
  { value: 'paypal',        label: 'PayPal'        },
  { value: 'otro',          label: 'Otro'          },
]

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

// ─── API ──────────────────────────────────────────────────
async function fetchInvoice(id: string): Promise<{ data: Invoice }> {
  const r = await fetch(`/api/invoices/${id}`)
  if (!r.ok) throw new Error('Cliente no encontrado')
  return r.json()
}

async function patchInvoice(id: string, body: Partial<Invoice>) {
  const r = await fetch(`/api/invoices/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? 'Error')
  return j
}

async function deleteInvoice(id: string) {
  const r = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? 'Error')
  return j
}

async function addPayment(invoiceId: string, body: Partial<Payment>) {
  const r = await fetch(`/api/invoices/${invoiceId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? 'Error')
  return j
}

async function patchPayment(id: string, body: Partial<Payment>) {
  const r = await fetch(`/api/payments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? 'Error')
  return j
}

async function deletePayment(id: string) {
  const r = await fetch(`/api/payments/${id}`, { method: 'DELETE' })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? 'Error')
  return j
}

// ─── Page ─────────────────────────────────────────────────
export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router  = useRouter()
  const qc      = useQueryClient()

  const [showEstadoDropdown, setShowEstadoDropdown] = useState(false)
  const [showAddPayment, setShowAddPayment]         = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['invoice', id],
    queryFn:  () => fetchInvoice(id),
  })

  const inv = data?.data

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['invoice', id] })
    qc.invalidateQueries({ queryKey: ['invoices'] })
  }

  const patchMutation = useMutation({
    mutationFn: (body: Partial<Invoice>) => patchInvoice(id, body),
    onSuccess: () => { toast.success('Actualizado'); invalidate(); setShowEstadoDropdown(false) },
    onError:   (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteInvoice(id),
    onSuccess: () => { toast.success('Cliente eliminado'); router.push('/billing') },
    onError:   (e: Error) => toast.error(e.message),
  })

  const addPaymentMutation = useMutation({
    mutationFn: (body: Partial<Payment>) => addPayment(id, body),
    onSuccess: () => { toast.success('Cuota agregada'); invalidate(); setShowAddPayment(false) },
    onError:   (e: Error) => toast.error(e.message),
  })

  const patchPaymentMutation = useMutation({
    mutationFn: ({ pid, body }: { pid: string; body: Partial<Payment> }) => patchPayment(pid, body),
    onSuccess: () => { toast.success('Pago registrado'); invalidate() },
    onError:   (e: Error) => toast.error(e.message),
  })

  const deletePaymentMutation = useMutation({
    mutationFn: (pid: string) => deletePayment(pid),
    onSuccess: () => { toast.success('Cuota eliminada'); invalidate() },
    onError:   (e: Error) => toast.error(e.message),
  })

  const remindMutation = useMutation({
    mutationFn: (pid: string) =>
      fetch(`/api/invoices/${id}/payments/${pid}/remind`, { method: 'POST' })
        .then(r => r.json().then(j => { if (!r.ok) throw new Error(j.error); return j })),
    onSuccess: () => { toast.success('Recordatorio enviado a somosglobalalora@gmail.com'); invalidate() },
    onError:   (e: Error) => toast.error(e.message),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !inv) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-slate-500">Cliente no encontrado</p>
        <button onClick={() => router.push('/billing')} className="text-blue-600 text-sm hover:underline">
          Volver al listado
        </button>
      </div>
    )
  }

  const total        = inv.total ?? 0
  const totalPagado  = inv.total_pagado ?? 0
  const totalPendiente = total - totalPagado
  const pct          = total > 0 ? Math.min(100, Math.round((totalPagado / total) * 100)) : 0
  const estadoCfg    = ESTADO_CFG[inv.estado]
  const payments     = inv.payments ?? []
  const items        = inv.items ?? []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/billing')}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{inv.cliente_nombre}</h1>
            {inv.cliente_email && <p className="text-sm text-slate-500">{inv.cliente_email}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Estado dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowEstadoDropdown(v => !v)}
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer transition-colors',
                estadoCfg.color
              )}
            >
              {estadoCfg.label}
              <ChevronDown size={12} />
            </button>
            {showEstadoDropdown && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[160px] py-1">
                {ESTADOS.map(e => (
                  <button
                    key={e}
                    onClick={() => patchMutation.mutate({ estado: e })}
                    className={cn(
                      'w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors flex items-center gap-2',
                      inv.estado === e ? 'font-medium text-blue-600' : 'text-slate-700'
                    )}
                  >
                    {inv.estado === e && <Check size={12} />}
                    <span className={inv.estado !== e ? 'pl-4' : ''}>{ESTADO_CFG[e].label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Alert toggle */}
          <button
            onClick={() => patchMutation.mutate({ alertas_activas: !inv.alertas_activas })}
            title={inv.alertas_activas ? 'Alertas activas — click para desactivar' : 'Alertas desactivadas — click para activar'}
            className={cn(
              'flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded-lg transition-colors',
              inv.alertas_activas
                ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                : 'text-slate-400 border-slate-200 hover:bg-slate-50'
            )}
          >
            {inv.alertas_activas ? <Bell size={14} /> : <BellOff size={14} />}
            <span className="hidden sm:inline">{inv.alertas_activas ? 'Alertas ON' : 'Alertas OFF'}</span>
          </button>

          {/* Delete */}
          <button
            onClick={() => {
              if (confirm('¿Eliminar este cliente? No se puede deshacer.')) deleteMutation.mutate()
            }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Eliminar cliente"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard
              label="Total"
              value={fmt(total, inv.moneda)}
              sub={`Emitida ${format(parseLocalDate(inv.fecha_emision), 'd MMM yyyy', { locale: es })}`}
              icon={FileText}
              color="text-slate-600"
            />
            <SummaryCard
              label="Cobrado"
              value={fmt(totalPagado, inv.moneda)}
              sub={`${pct}% del total`}
              icon={Check}
              color="text-green-600"
              extra={
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                  <div
                    className={cn('h-full rounded-full', pct >= 100 ? 'bg-green-500' : 'bg-amber-400')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              }
            />
            <SummaryCard
              label="Pendiente"
              value={fmt(totalPendiente, inv.moneda)}
              sub={inv.fecha_vencimiento
                ? `Vence ${format(parseLocalDate(inv.fecha_vencimiento), 'd MMM yyyy', { locale: es })}`
                : 'Sin fecha de vencimiento'}
              icon={Calendar}
              color={totalPendiente > 0 ? 'text-amber-600' : 'text-slate-400'}
            />
          </div>

          {/* Details + project */}
          {(inv.descripcion || inv.project || inv.notas) && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Detalles</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {inv.project && (
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Proyecto</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: inv.project.color }} />
                      <span className="text-slate-800 font-medium">{inv.project.nombre}</span>
                    </div>
                  </div>
                )}
                {inv.cliente_email && (
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Email cliente</p>
                    <p className="text-slate-800">{inv.cliente_email}</p>
                  </div>
                )}
                {inv.descripcion && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 mb-0.5">Descripción</p>
                    <p className="text-slate-700">{inv.descripcion}</p>
                  </div>
                )}
                {inv.notas && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 mb-0.5">Notas internas</p>
                    <p className="text-slate-500 italic text-xs">{inv.notas}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Items table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-700">Ítems</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-2 text-xs font-semibold text-slate-500">Descripción</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500">Cant.</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500">Precio unit.</th>
                  <th className="text-right px-5 py-2 text-xs font-semibold text-slate-500">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} className="border-b border-slate-50">
                    <td className="px-5 py-3 text-slate-800">{it.descripcion}</td>
                    <td className="px-3 py-3 text-center text-slate-600 font-mono">{it.cantidad}</td>
                    <td className="px-3 py-3 text-right text-slate-600 font-mono">{fmt(it.precio_unitario, inv.moneda)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-slate-800 font-mono">
                      {fmt(it.cantidad * it.precio_unitario, inv.moneda)}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-slate-400 text-xs">Sin ítems</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td colSpan={3} className="px-5 py-3 text-right text-sm font-semibold text-slate-700">Total</td>
                  <td className="px-5 py-3 text-right text-base font-bold text-slate-900 font-mono">{fmt(total, inv.moneda)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Payments / Cuotas */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                Plan de pagos
                <span className="ml-2 text-xs text-slate-400 font-normal">({payments.length} cuota{payments.length !== 1 ? 's' : ''})</span>
              </h3>
              <button
                onClick={() => setShowAddPayment(v => !v)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <Plus size={12} />
                Agregar cuota
              </button>
            </div>

            {/* Add payment form */}
            {showAddPayment && (
              <AddPaymentForm
                moneda={inv.moneda}
                onSave={(body) => addPaymentMutation.mutate(body)}
                onCancel={() => setShowAddPayment(false)}
                isLoading={addPaymentMutation.isPending}
              />
            )}

            <div className="divide-y divide-slate-50">
              {payments.map(p => {
                const isPaid    = !!p.fecha_pago
                const isOverdue = !isPaid && !!p.fecha_vencimiento && getDaysUntil(p.fecha_vencimiento) < 0
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'px-5 py-4 flex items-center gap-4',
                      isPaid ? 'bg-green-50/40' : isOverdue ? 'bg-red-50/40' : ''
                    )}
                  >
                    {/* Paid indicator */}
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                      isPaid ? 'bg-green-500 text-white' : isOverdue ? 'bg-red-100 text-red-500' : 'bg-slate-100 text-slate-400'
                    )}>
                      {isPaid ? <Check size={13} /> : <DollarSign size={13} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{p.descripcion}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                        {p.fecha_vencimiento && (
                          <span>Vence {format(parseLocalDate(p.fecha_vencimiento), 'd MMM yyyy', { locale: es })}</span>
                        )}
                        {isPaid && p.fecha_pago && (
                          <span className="text-green-600">
                            Pagado {format(parseLocalDate(p.fecha_pago), 'd MMM yyyy', { locale: es })}
                            {p.metodo_pago && ` · ${METODOS.find(m => m.value === p.metodo_pago)?.label}`}
                          </span>
                        )}
                        {isOverdue && <span className="text-red-500 font-medium">Vencido</span>}
                        {p.numero_factura && <span>Factura {p.numero_factura}</span>}
                        {p.factura_enviada_at && (
                          <span className="text-blue-500">Enviada {format(new Date(p.factura_enviada_at), 'd MMM', { locale: es })}</span>
                        )}
                        {p.notas && <span className="italic">{p.notas}</span>}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-mono font-semibold text-slate-800">{fmt(p.monto, inv.moneda)}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <PaymentDocsButton
                        payment={p}
                        onSave={(body) => patchPaymentMutation.mutate({ pid: p.id, body })}
                        isLoading={patchPaymentMutation.isPending}
                      />
                      {!isPaid && (
                        <MarkPaidButton
                          payment={p}
                          onMark={(fecha_pago, metodo_pago) =>
                            patchPaymentMutation.mutate({ pid: p.id, body: { fecha_pago, metodo_pago } })
                          }
                          isLoading={patchPaymentMutation.isPending}
                        />
                      )}
                      {!isPaid && (
                        <button
                          onClick={() => remindMutation.mutate(p.id)}
                          disabled={remindMutation.isPending}
                          title={p.alerta_enviada_at
                            ? `Último aviso: ${format(new Date(p.alerta_enviada_at), 'd MMM HH:mm', { locale: es })}`
                            : 'Enviar aviso interno'}
                          className={cn(
                            'flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors',
                            p.alerta_enviada_at
                              ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                              : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                          )}
                        >
                          {remindMutation.isPending
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Bell size={11} />}
                        </button>
                      )}
                      {isPaid && (
                        <button
                          onClick={() => patchPaymentMutation.mutate({ pid: p.id, body: { fecha_pago: null, metodo_pago: null } })}
                          className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                          title="Desmarcar como pagado"
                        >
                          Desmarcar
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm('¿Eliminar esta cuota?')) deletePaymentMutation.mutate(p.id)
                        }}
                        className="p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}

              {payments.length === 0 && !showAddPayment && (
                <div className="px-5 py-6 text-center text-slate-400 text-sm">
                  <p>Sin cuotas registradas</p>
                  <button onClick={() => setShowAddPayment(true)} className="text-blue-600 text-xs mt-1 hover:underline">
                    Agregar cuota
                  </button>
                </div>
              )}
            </div>

            {/* Payment summary */}
            {payments.length > 0 && (
              <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  {payments.filter(p => p.fecha_pago).length} de {payments.length} cuotas pagadas
                </span>
                <span className="font-semibold text-slate-700 font-mono">
                  {fmt(totalPagado, inv.moneda)} / {fmt(total, inv.moneda)}
                </span>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Summary Card ─────────────────────────────────────────
function SummaryCard({ label, value, sub, icon: Icon, color, extra }: {
  label: string; value: string; sub: string
  icon: React.ElementType; color: string; extra?: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={color} />
        <span className="text-xs text-slate-500 font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-slate-900 font-mono leading-tight">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      {extra}
    </div>
  )
}

// ─── Add Payment Form ─────────────────────────────────────
function AddPaymentForm({
  moneda, onSave, onCancel, isLoading,
}: {
  moneda: string
  onSave: (body: Partial<Payment>) => void
  onCancel: () => void
  isLoading: boolean
}) {
  const [form, setForm] = useState({
    descripcion:       'Cuota',
    monto:             '',
    fecha_vencimiento: '',
    notas:             '',
  })

  return (
    <div className="px-5 py-4 bg-blue-50/60 border-b border-blue-100">
      <p className="text-xs font-medium text-blue-700 mb-3">Nueva cuota</p>
      <div className="grid grid-cols-12 gap-2">
        <input
          type="text"
          value={form.descripcion}
          onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
          placeholder="Descripción"
          className="col-span-4 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="col-span-3 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{moneda}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.monto}
            onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
            placeholder="0"
            className="w-full text-sm border border-slate-200 rounded-lg pl-10 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <input
          type="date"
          value={form.fecha_vencimiento}
          onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
          className="col-span-3 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={onCancel}
          type="button"
          className="col-span-1 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg transition-colors"
        >
          ✕
        </button>
        <button
          onClick={() => {
            if (!form.monto || parseFloat(form.monto) <= 0) return
            onSave({
              descripcion:       form.descripcion || 'Cuota',
              monto:             parseFloat(form.monto),
              fecha_vencimiento: form.fecha_vencimiento || null,
              notas:             form.notas || null,
            })
          }}
          disabled={isLoading || !form.monto || parseFloat(form.monto) <= 0}
          className="col-span-1 flex items-center justify-center text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
        </button>
      </div>
    </div>
  )
}

// ─── Mark Paid Button ──────────────────────────────────────
function MarkPaidButton({
  payment, onMark, isLoading,
}: {
  payment: Payment
  onMark: (fecha_pago: string, metodo_pago: PaymentMetodo) => void
  isLoading: boolean
}) {
  const [open, setOpen] = useState(false)
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [metodo, setMetodo] = useState<PaymentMetodo>('transferencia')

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700 transition-colors"
      >
        <Check size={11} />
        Marcar pagado
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 p-3 space-y-2 min-w-[220px]">
          <p className="text-xs font-medium text-slate-700">Registrar pago</p>
          <div>
            <label className="text-xs text-slate-500">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1 mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Método</label>
            <select
              value={metodo}
              onChange={e => setMetodo(e.target.value as PaymentMetodo)}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1 mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setOpen(false)}
              className="flex-1 text-xs border border-slate-200 rounded-lg py-1.5 text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => { onMark(fecha, metodo); setOpen(false) }}
              disabled={isLoading}
              className="flex-1 text-xs bg-green-600 text-white rounded-lg py-1.5 hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Payment Docs Button (N° factura, envío, documentos) ──
function PaymentDocsButton({
  payment, onSave, isLoading,
}: {
  payment: Payment
  onSave: (body: Partial<Payment>) => void
  isLoading: boolean
}) {
  const [open, setOpen] = useState(false)
  const [numeroFactura, setNumeroFactura] = useState(payment.numero_factura ?? '')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function uploadFiles(files: File[]) {
    if (!files.length) return
    setUploading(true)
    const results = await Promise.all(files.map(async (f) => {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/portal/upload', { method: 'POST', body: fd }).then(r => r.json())
      return res.url ? { url: res.url as string, name: res.name ?? f.name, type: res.type ?? f.type } as TicketAttachment : null
    }))
    const valid = results.filter(Boolean) as TicketAttachment[]
    if (valid.length) onSave({ attachments: [...(payment.attachments ?? []), ...valid] })
    setUploading(false)
  }

  function removeDoc(url: string) {
    onSave({ attachments: (payment.attachments ?? []).filter(a => a.url !== url) })
  }

  function saveNumero() {
    if (numeroFactura !== (payment.numero_factura ?? '')) {
      onSave({ numero_factura: numeroFactura.trim() || null })
    }
  }

  const docCount = payment.attachments?.length ?? 0
  const hasInfo  = !!payment.numero_factura || !!payment.factura_enviada_at || docCount > 0

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Factura y documentos"
        className={cn(
          'flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors',
          hasInfo ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
        )}
      >
        <FileText size={11} />
        {docCount > 0 && <span>{docCount}</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { saveNumero(); setOpen(false) }} />
          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 p-3 space-y-3 w-64" onClick={e => e.stopPropagation()}>
            <div>
              <label className="text-xs text-slate-500">N° de factura</label>
              <input
                type="text"
                value={numeroFactura}
                onChange={e => setNumeroFactura(e.target.value)}
                onBlur={saveNumero}
                placeholder="Ej: A-0001-00001234"
                className="w-full text-xs border border-slate-200 rounded px-2 py-1 mt-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {payment.factura_enviada_at
                  ? `Enviada ${format(new Date(payment.factura_enviada_at), 'd MMM', { locale: es })}`
                  : 'Factura no enviada'}
              </span>
              <button
                onClick={() => onSave({ factura_enviada_at: payment.factura_enviada_at ? null : new Date().toISOString() })}
                disabled={isLoading}
                className={cn(
                  'text-xs px-2 py-1 rounded transition-colors flex-shrink-0',
                  payment.factura_enviada_at ? 'text-slate-500 hover:bg-slate-100' : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                )}
              >
                {payment.factura_enviada_at ? 'Desmarcar' : 'Marcar enviada'}
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-500">Documentos</label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                >
                  {uploading ? 'Subiendo...' : '+ Adjuntar'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={e => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = '' }}
                />
              </div>
              {docCount > 0 ? (
                <div className="space-y-1">
                  {payment.attachments!.map((a, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <a
                        href={downloadHref(a.url, a.name)}
                        className="flex-1 min-w-0 text-xs text-slate-600 hover:text-blue-600 truncate"
                      >
                        {a.name}
                      </a>
                      <button onClick={() => removeDoc(a.url)} className="text-slate-300 hover:text-red-400 flex-shrink-0">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-300">Sin documentos</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
