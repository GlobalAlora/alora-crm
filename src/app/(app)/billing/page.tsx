'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Plus, Receipt, TrendingUp, Clock, AlertTriangle, FileText,
  Loader2, ChevronRight, ChevronLeft, CalendarRange,
} from 'lucide-react'
import {
  format, addMonths, subMonths, addQuarters, subQuarters, addYears, subYears,
  getDaysInMonth, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { cn, parseLocalDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import type { Invoice, InvoiceEstado, CondicionIva, TipoCobranza } from '@/types'

const MESES_ADELANTADOS_MANTENIMIENTO = 12

function generateMonthlyPayments(startMonth: Date, diaCobro: number, monto: number, count: number) {
  const payments: { descripcion: string; monto: number; fecha_vencimiento: string; metodo_pago: null }[] = []
  for (let i = 0; i < count; i++) {
    const monthDate = addMonths(startMonth, i)
    const day = Math.min(diaCobro, getDaysInMonth(monthDate))
    const due = new Date(monthDate.getFullYear(), monthDate.getMonth(), day)
    const label = format(due, 'MMMM yyyy', { locale: es })
    payments.push({
      descripcion: `Mantenimiento ${label.charAt(0).toUpperCase()}${label.slice(1)}`,
      monto,
      fecha_vencimiento: due.toISOString().slice(0, 10),
      metodo_pago: null,
    })
  }
  return payments
}

// ─── helpers ──────────────────────────────────────────────
const ESTADO_CFG: Record<InvoiceEstado, { label: string; color: string; dot: string }> = {
  pendiente:  { label: 'Pendiente', color: 'bg-slate-100 text-slate-600',   dot: 'bg-slate-400' },
  parcial:    { label: 'Parcial',   color: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500' },
  cobrado:    { label: 'Cobrado',   color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  vencido:    { label: 'Vencido',   color: 'bg-red-100 text-red-700',      dot: 'bg-red-500'   },
  cancelada:  { label: 'Cancelada', color: 'bg-slate-100 text-slate-400',  dot: 'bg-slate-300' },
}

const TABS: { value: string; label: string }[] = [
  { value: 'all',       label: 'Todos'     },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'parcial',   label: 'Parcial'   },
  { value: 'cobrado',   label: 'Cobrado'   },
  { value: 'vencido',   label: 'Vencido'   },
  { value: 'cancelada', label: 'Cancelada' },
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
  lead_id: string
  cliente_nombre: string
  cliente_email: string
  cliente_telefono: string
  cliente_razon_social: string
  cliente_cuit: string
  cliente_condicion_iva: CondicionIva | ''
  cliente_domicilio: string
  project_id: string
  moneda: 'USD' | 'ARS'
  fecha_emision: string
  descripcion: string
  notas: string
  tipo_cobranza: TipoCobranza
  dia_cobro: string
  monto_recurrente: string
  mantenimiento_desde: string
  payments: { descripcion: string; monto: number; fecha_vencimiento: string; metodo_pago: string }[]
}

async function fetchProjects(): Promise<{ data: { id: string; nombre: string }[] }> {
  const r = await fetch('/api/projects')
  if (!r.ok) return { data: [] }
  return r.json()
}

async function createInvoice(body: Record<string, unknown>) {
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
  const [periodType, setPeriodType] = useState<'mes' | 'trimestre' | 'año' | 'rango'>('mes')
  const [anchor, setAnchor]   = useState(() => new Date())
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo]     = useState('')

  const periodStart = periodType === 'rango' ? rangeFrom
    : format(
        periodType === 'trimestre' ? startOfQuarter(anchor) : periodType === 'año' ? startOfYear(anchor) : startOfMonth(anchor),
        'yyyy-MM-dd'
      )
  const periodEnd = periodType === 'rango' ? rangeTo
    : format(
        periodType === 'trimestre' ? endOfQuarter(anchor) : periodType === 'año' ? endOfYear(anchor) : endOfMonth(anchor),
        'yyyy-MM-dd'
      )
  const periodLabel = periodType === 'rango'
    ? (rangeFrom && rangeTo ? `${format(parseLocalDate(rangeFrom), 'd MMM yy', { locale: es })} → ${format(parseLocalDate(rangeTo), 'd MMM yy', { locale: es })}` : 'Elegí un rango')
    : periodType === 'trimestre' ? `T${Math.floor(anchor.getMonth() / 3) + 1} ${anchor.getFullYear()}`
    : periodType === 'año' ? String(anchor.getFullYear())
    : format(anchor, 'MMMM yyyy', { locale: es })
  const isCurrentPeriod = periodType !== 'rango' && (
    periodType === 'mes' ? isSameMonthYear(anchor, new Date())
    : periodType === 'trimestre' ? Math.floor(anchor.getMonth() / 3) === Math.floor(new Date().getMonth() / 3) && anchor.getFullYear() === new Date().getFullYear()
    : anchor.getFullYear() === new Date().getFullYear()
  )
  function isSameMonthYear(a: Date, b: Date) { return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() }
  function shiftPeriod(dir: 1 | -1) {
    setAnchor(a =>
      periodType === 'trimestre' ? (dir === 1 ? addQuarters(a, 1) : subQuarters(a, 1))
      : periodType === 'año' ? (dir === 1 ? addYears(a, 1) : subYears(a, 1))
      : (dir === 1 ? addMonths(a, 1) : subMonths(a, 1))
    )
  }

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

  // Period-scoped, not lifetime totals — "Cobrado" without a period
  // attached doesn't mean anything (cobrado when? this month? ever?).
  const todayStr = new Date().toISOString().slice(0, 10)
  function statsFor(list: Invoice[]) {
    const payments = list.flatMap(i => i.payments ?? [])
    let cobrado = 0, pendiente = 0, vencido = 0
    if (!periodStart || !periodEnd) return { facturado: 0, pendiente: 0, vencido: 0 }
    for (const p of payments) {
      if (p.fecha_pago) {
        if (p.fecha_pago >= periodStart && p.fecha_pago <= periodEnd) cobrado += p.monto
      } else if (p.fecha_vencimiento && p.fecha_vencimiento >= periodStart && p.fecha_vencimiento <= periodEnd) {
        if (p.fecha_vencimiento < todayStr) vencido += p.monto
        else pendiente += p.monto
      }
    }
    return { facturado: cobrado, pendiente, vencido }
  }

  const usdStats = statsFor(usdInvoices)
  const arsStats = statsFor(arsInvoices)

  const create = useMutation({
    mutationFn: createInvoice,
    onSuccess: (res) => {
      toast.success(`Cliente ${res.data.cliente_nombre} creado`)
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
            <h1 className="text-lg font-semibold text-slate-900">Cobranza</h1>
            <p className="text-sm text-slate-500">{invoices.length} cliente{invoices.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/billing/control')}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-medium px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <CalendarRange size={15} />
            Control mensual
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={15} />
            Nuevo cliente
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="px-6 py-4 border-b bg-slate-50 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="flex gap-1 bg-slate-200/60 rounded-lg p-0.5">
            {(['mes', 'trimestre', 'año', 'rango'] as const).map(pt => (
              <button
                key={pt}
                onClick={() => setPeriodType(pt)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-md transition-colors capitalize',
                  periodType === pt ? 'bg-white text-slate-800 shadow-sm font-medium' : 'text-slate-500'
                )}
              >
                {pt}
              </button>
            ))}
          </div>

          {periodType === 'rango' ? (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={rangeFrom}
                onChange={e => setRangeFrom(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-slate-400 text-xs">→</span>
              <input
                type="date"
                value={rangeTo}
                onChange={e => setRangeTo(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => shiftPeriod(-1)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-semibold text-slate-600 capitalize w-24 text-center">
                {periodLabel}
              </span>
              <button
                onClick={() => shiftPeriod(1)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
              >
                <ChevronRight size={14} />
              </button>
              {!isCurrentPeriod && (
                <button onClick={() => setAnchor(new Date())} className="text-xs text-blue-600 hover:underline">
                  Volver a hoy
                </button>
              )}
            </div>
          )}
        </div>
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
            <p className="text-slate-400 text-sm">No hay clientes</p>
            <button
              onClick={() => setShowModal(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              Agregar primer cliente
            </button>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
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
                  const isRecurrente = inv.tipo_cobranza === 'recurrente'
                  const cfg    = ESTADO_CFG[inv.estado]
                  const cfgLabel = isRecurrente && inv.estado === 'cobrado' ? 'Al día' : cfg.label
                  const total  = inv.total ?? 0
                  const cobrado = inv.total_pagado ?? 0
                  const pct    = total > 0 ? Math.round((cobrado / total) * 100) : 0
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => router.push(`/billing/${inv.id}`)}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-slate-800 leading-tight">{inv.cliente_nombre}</p>
                          {inv.tipo_cobranza === 'recurrente' && (
                            <span className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                              inv.mantenimiento_activo ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
                            )}>
                              Mantenimiento{!inv.mantenimiento_activo && ' (pausado)'}
                            </span>
                          )}
                        </div>
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
                        {format(parseLocalDate(inv.fecha_emision), 'd MMM yyyy', { locale: es })}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {inv.fecha_vencimiento
                          ? format(parseLocalDate(inv.fecha_vencimiento), 'd MMM yyyy', { locale: es })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-800 font-medium whitespace-nowrap">
                        {isRecurrente
                          ? `${fmt(inv.monto_recurrente ?? 0, inv.moneda)}/mes`
                          : fmt(total, inv.moneda)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isRecurrente ? (
                          <span className="font-mono text-xs text-slate-600">{fmt(cobrado, inv.moneda)}</span>
                        ) : (
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
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', cfg.color)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                          {cfgLabel}
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

// ─── Nuevo cliente Modal ─────────────────────────────────────
interface LeadOption {
  id: string
  nombre: string
  apellido: string | null
  empresa: string | null
  email: string | null
  telefono: string | null
}

async function searchLeads(query: string): Promise<LeadOption[]> {
  if (query.trim().length < 2) return []
  const r = await fetch(`/api/leads?buscar=${encodeURIComponent(query)}&limit=8`)
  if (!r.ok) return []
  const j = await r.json()
  return j.data ?? []
}

function NewInvoiceModal({
  onClose, onSubmit, isLoading,
}: {
  onClose: () => void
  onSubmit: (data: Record<string, unknown>) => void
  isLoading: boolean
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState<NewInvoiceForm>({
    lead_id:               '',
    cliente_nombre:        '',
    cliente_email:         '',
    cliente_telefono:      '',
    cliente_razon_social:  '',
    cliente_cuit:          '',
    cliente_condicion_iva: '',
    cliente_domicilio:     '',
    project_id:            '',
    moneda:                'USD',
    fecha_emision:         today,
    descripcion:           '',
    notas:                 '',
    tipo_cobranza:         'proyecto',
    dia_cobro:             '',
    monto_recurrente:      '',
    mantenimiento_desde:   today.slice(0, 7),
    payments: [{ descripcion: 'Pago único', monto: 0, fecha_vencimiento: '', metodo_pago: '' }],
  })
  const [tipoPago, setTipoPago] = useState<'unico' | 'cuotas'>('unico')
  const [leadQuery, setLeadQuery] = useState('')
  const [leadResults, setLeadResults] = useState<LeadOption[]>([])
  const [showLeadResults, setShowLeadResults] = useState(false)
  const [linkedLead, setLinkedLead] = useState<LeadOption | null>(null)

  const { data: projData } = useQuery({ queryKey: ['projects'], queryFn: fetchProjects })
  const projects = projData?.data ?? []

  const total = form.payments.reduce((s, p) => s + (p.monto || 0), 0)

  async function onLeadQueryChange(value: string) {
    setLeadQuery(value)
    setShowLeadResults(true)
    setLeadResults(await searchLeads(value))
  }

  function pickLead(lead: LeadOption) {
    setLinkedLead(lead)
    setLeadQuery('')
    setShowLeadResults(false)
    setForm(f => ({
      ...f,
      lead_id: lead.id,
      cliente_nombre:  f.cliente_nombre || [lead.nombre, lead.apellido].filter(Boolean).join(' ') || lead.empresa || '',
      cliente_email:    f.cliente_email    || lead.email    || '',
      cliente_telefono: f.cliente_telefono || lead.telefono || '',
    }))
  }

  function unlinkLead() {
    setLinkedLead(null)
    setForm(f => ({ ...f, lead_id: '' }))
  }

  function setTipoPagoMode(mode: 'unico' | 'cuotas') {
    setTipoPago(mode)
    if (mode === 'unico') {
      setForm(f => ({ ...f, payments: [f.payments[0] ?? { descripcion: 'Pago único', monto: 0, fecha_vencimiento: '', metodo_pago: '' }] }))
    } else if (form.payments.length < 2) {
      setForm(f => ({
        ...f,
        payments: [
          { ...f.payments[0], descripcion: 'Cuota 1' },
          { descripcion: 'Cuota 2', monto: 0, fecha_vencimiento: '', metodo_pago: '' },
        ],
      }))
    }
  }

  function addPayment() {
    setForm(f => ({
      ...f,
      payments: [...f.payments, { descripcion: `Cuota ${f.payments.length + 1}`, monto: 0, fecha_vencimiento: '', metodo_pago: '' }],
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

  function submit(e?: React.SyntheticEvent) {
    e?.preventDefault()
    if (!form.cliente_nombre.trim()) return

    const isRecurrente = form.tipo_cobranza === 'recurrente'
    const diaCobro = parseInt(form.dia_cobro, 10)
    const montoRecurrente = parseFloat(form.monto_recurrente)

    if (isRecurrente && (!diaCobro || diaCobro < 1 || diaCobro > 31 || !montoRecurrente || montoRecurrente <= 0)) {
      toast.error('Completá el monto mensual y el día de cobro (1-31)')
      return
    }

    const payments = isRecurrente
      ? generateMonthlyPayments(new Date(form.mantenimiento_desde + '-01T00:00:00'), diaCobro, montoRecurrente, MESES_ADELANTADOS_MANTENIMIENTO)
      : form.payments.filter(p => p.monto > 0)

    onSubmit({
      ...form,
      lead_id:               form.lead_id || undefined,
      project_id:            form.project_id || undefined,
      cliente_email:         form.cliente_email || undefined,
      cliente_telefono:      form.cliente_telefono || undefined,
      cliente_razon_social:  form.cliente_razon_social || undefined,
      cliente_cuit:          form.cliente_cuit || undefined,
      cliente_condicion_iva: form.cliente_condicion_iva || undefined,
      cliente_domicilio:     form.cliente_domicilio || undefined,
      descripcion:           form.descripcion || undefined,
      notas:                 form.notas || undefined,
      dia_cobro:             isRecurrente ? diaCobro : undefined,
      monto_recurrente:      isRecurrente ? montoRecurrente : undefined,
      payments,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-900">Nuevo cliente</h2>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Lead link */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Asociar a un lead existente (opcional)</label>
            {linkedLead ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <span className="text-sm text-blue-800">
                  {[linkedLead.nombre, linkedLead.apellido].filter(Boolean).join(' ')}
                  {linkedLead.empresa && ` · ${linkedLead.empresa}`}
                </span>
                <button type="button" onClick={unlinkLead} className="text-xs text-blue-600 hover:underline">Quitar</button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={leadQuery}
                  onChange={e => onLeadQueryChange(e.target.value)}
                  onFocus={() => setShowLeadResults(true)}
                  placeholder="Buscar por nombre o empresa..."
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {showLeadResults && leadResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {leadResults.map(lead => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => pickLead(lead)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                      >
                        <span className="font-medium text-slate-800">{[lead.nombre, lead.apellido].filter(Boolean).join(' ')}</span>
                        {lead.empresa && <span className="text-slate-400"> · {lead.empresa}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

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
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={form.cliente_email}
                onChange={e => setForm(f => ({ ...f, cliente_email: e.target.value }))}
                placeholder="cliente@email.com"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Teléfono</label>
              <input
                type="text"
                value={form.cliente_telefono}
                onChange={e => setForm(f => ({ ...f, cliente_telefono: e.target.value }))}
                placeholder="+54 9 ..."
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
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
          </div>

          {/* Datos de facturación */}
          <div className="border border-slate-100 rounded-lg p-3 space-y-3 bg-slate-50/50">
            <p className="text-xs font-semibold text-slate-600">Datos de facturación</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Razón social</label>
                <input
                  type="text"
                  value={form.cliente_razon_social}
                  onChange={e => setForm(f => ({ ...f, cliente_razon_social: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">CUIT</label>
                <input
                  type="text"
                  value={form.cliente_cuit}
                  onChange={e => setForm(f => ({ ...f, cliente_cuit: e.target.value }))}
                  placeholder="20-12345678-9"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Condición frente al IVA</label>
                <select
                  value={form.cliente_condicion_iva}
                  onChange={e => setForm(f => ({ ...f, cliente_condicion_iva: e.target.value as CondicionIva | '' }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin especificar</option>
                  <option value="responsable_inscripto">Responsable Inscripto</option>
                  <option value="monotributo">Monotributo</option>
                  <option value="exento">Exento</option>
                  <option value="consumidor_final">Consumidor Final</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Domicilio fiscal</label>
                <input
                  type="text"
                  value={form.cliente_domicilio}
                  onChange={e => setForm(f => ({ ...f, cliente_domicilio: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Moneda</label>
              <select
                value={form.moneda}
                onChange={e => setForm(f => ({ ...f, moneda: e.target.value as 'USD' | 'ARS' }))}
                className="w-32 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de cobranza</label>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tipo_cobranza: 'proyecto' }))}
                  className={cn('text-xs px-3 py-2 rounded-md transition-colors', form.tipo_cobranza === 'proyecto' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500')}
                >
                  Proyecto
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, tipo_cobranza: 'recurrente' }))}
                  className={cn('text-xs px-3 py-2 rounded-md transition-colors', form.tipo_cobranza === 'recurrente' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500')}
                >
                  Mantenimiento
                </button>
              </div>
            </div>
          </div>

          {form.tipo_cobranza === 'recurrente' ? (
            /* Recurring maintenance */
            <div className="border border-slate-100 rounded-lg p-3 space-y-3 bg-slate-50/50">
              <p className="text-xs font-semibold text-slate-600">Mantenimiento recurrente</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Monto mensual</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.monto_recurrente}
                    onChange={e => setForm(f => ({ ...f, monto_recurrente: e.target.value }))}
                    placeholder="0"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Día de cobro (1-31)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={form.dia_cobro}
                    onChange={e => setForm(f => ({ ...f, dia_cobro: e.target.value }))}
                    placeholder="Ej: 10"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Primera cuota a generar (mes)</label>
                  <input
                    type="month"
                    value={form.mantenimiento_desde}
                    onChange={e => setForm(f => ({ ...f, mantenimiento_desde: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Por defecto es este mes. Si el cliente ya tenía cuotas atrasadas de meses anteriores, elegí ese mes acá.
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                Se generan automáticamente las cuotas de los próximos {MESES_ADELANTADOS_MANTENIMIENTO} meses desde ahí, y el sistema sigue generando más a medida que pasa el tiempo. Podés editar el monto de cuotas futuras si aumenta el precio, o pausar el mantenimiento en cualquier momento.
              </p>
            </div>
          ) : (
          /* Payment schedule (proyecto) */
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-700">Pagos</label>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setTipoPagoMode('unico')}
                  className={cn('text-xs px-2.5 py-1 rounded-md transition-colors', tipoPago === 'unico' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500')}
                >
                  Pago único
                </button>
                <button
                  type="button"
                  onClick={() => setTipoPagoMode('cuotas')}
                  className={cn('text-xs px-2.5 py-1 rounded-md transition-colors', tipoPago === 'cuotas' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500')}
                >
                  En cuotas
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {form.payments.map((p, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={p.descripcion}
                    onChange={e => setPayment(idx, 'descripcion', e.target.value)}
                    placeholder="Concepto"
                    className={cn('text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500', tipoPago === 'cuotas' ? 'col-span-3' : 'col-span-4')}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={p.monto || ''}
                    onChange={e => setPayment(idx, 'monto', parseFloat(e.target.value) || 0)}
                    placeholder="Monto"
                    className="col-span-2 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="date"
                    value={p.fecha_vencimiento}
                    onChange={e => setPayment(idx, 'fecha_vencimiento', e.target.value)}
                    className="col-span-3 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={p.metodo_pago}
                    onChange={e => setPayment(idx, 'metodo_pago', e.target.value)}
                    className="col-span-3 text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Forma de pago</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="mercadopago">MercadoPago</option>
                    <option value="paypal">PayPal</option>
                    <option value="otro">Otro</option>
                  </select>
                  {tipoPago === 'cuotas' && (
                    <button
                      type="button"
                      onClick={() => removePayment(idx)}
                      disabled={form.payments.length === 1}
                      className="col-span-1 text-slate-300 hover:text-red-400 transition-colors disabled:opacity-30 text-center"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            {tipoPago === 'cuotas' && (
              <button type="button" onClick={addPayment} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-2">
                <Plus size={11} /> Agregar cuota
              </button>
            )}
            <div className="flex justify-end mt-2">
              <span className="text-sm font-semibold text-slate-700">
                Total: {form.moneda} {total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          )}

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
            onClick={(e) => submit(e)}
            disabled={isLoading || !form.cliente_nombre.trim()}
            className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Crear cliente
          </button>
        </div>
      </div>
    </div>
  )
}
