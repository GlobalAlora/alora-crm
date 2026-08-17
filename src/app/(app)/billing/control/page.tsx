'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, ChevronDown, ChevronUp, CalendarRange,
} from 'lucide-react'
import { format, startOfMonth, addMonths, subMonths, isSameMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn, parseLocalDate } from '@/lib/utils'
import type { Invoice, Payment } from '@/types'

const MONTHS_BACK   = 3
const MONTHS_FORWARD = 6

async function fetchInvoices(): Promise<{ data: Invoice[] }> {
  const r = await fetch('/api/invoices')
  if (!r.ok) throw new Error('Error al cargar cobranza')
  return r.json()
}

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

interface FlatPayment extends Payment {
  cliente_nombre: string
  moneda: 'USD' | 'ARS'
}

interface MonthBucket {
  month: Date
  payments: FlatPayment[]
}

interface CurrencyTotals {
  esperado: number
  cobrado: number
  vencido: number
  pendiente: number
}

export default function BillingControlPage() {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices'],
    queryFn:  fetchInvoices,
    retry:    false,
  })

  const flatPayments: FlatPayment[] = useMemo(() => {
    return (data?.data ?? [])
      .filter(inv => inv.estado !== 'cancelada')
      .flatMap(inv =>
        (inv.payments ?? [])
          .filter(p => !!p.fecha_vencimiento)
          .map(p => ({ ...p, cliente_nombre: inv.cliente_nombre, moneda: inv.moneda }))
      )
  }, [data])

  const buckets: MonthBucket[] = useMemo(() => {
    const today = startOfMonth(new Date())
    const dates = flatPayments.map(p => startOfMonth(parseLocalDate(p.fecha_vencimiento!)))
    const earliest = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : today
    const latest   = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : today

    const rangeStart = new Date(Math.min(subMonths(today, MONTHS_BACK).getTime(), earliest.getTime()))
    const rangeEnd   = new Date(Math.max(addMonths(today, MONTHS_FORWARD).getTime(), latest.getTime()))

    const months: Date[] = []
    let cursor = rangeStart
    while (cursor <= rangeEnd) {
      months.push(cursor)
      cursor = addMonths(cursor, 1)
    }

    return months.map(month => ({
      month,
      payments: flatPayments
        .filter(p => isSameMonth(parseLocalDate(p.fecha_vencimiento!), month))
        .sort((a, b) => (a.fecha_vencimiento! < b.fecha_vencimiento! ? -1 : 1)),
    }))
  }, [flatPayments])

  const todayStr = new Date().toISOString().slice(0, 10)

  function totalsFor(payments: FlatPayment[]): Record<string, CurrencyTotals> {
    const byCurrency: Record<string, CurrencyTotals> = {}
    for (const p of payments) {
      if (!byCurrency[p.moneda]) byCurrency[p.moneda] = { esperado: 0, cobrado: 0, vencido: 0, pendiente: 0 }
      const t = byCurrency[p.moneda]
      t.esperado += p.monto
      if (p.fecha_pago) {
        t.cobrado += p.monto
      } else if (p.fecha_vencimiento! < todayStr) {
        t.vencido += p.monto
      } else {
        t.pendiente += p.monto
      }
    }
    return byCurrency
  }

  function toggle(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-slate-500">No se pudo cargar el control de cobranza</p>
        <button onClick={() => router.push('/billing')} className="text-blue-600 text-sm hover:underline">
          Volver
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b bg-white flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => router.push('/billing')}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <CalendarRange size={20} className="text-blue-600" />
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Control de cobranza</h1>
          <p className="text-sm text-slate-500">Qué se cobró, qué falta cobrar y cuándo, mes a mes</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
            {buckets.map(bucket => {
              const key = bucket.month.toISOString()
              const isCurrent = isSameMonth(bucket.month, new Date())
              const isCollapsed = collapsed.has(key) || (bucket.payments.length === 0)
              const totals = totalsFor(bucket.payments)
              const currencies = Object.keys(totals)

              return (
                <div
                  key={key}
                  className={cn(
                    'bg-white border rounded-xl overflow-hidden',
                    isCurrent ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'
                  )}
                >
                  <button
                    onClick={() => toggle(key)}
                    disabled={bucket.payments.length === 0}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors disabled:cursor-default disabled:hover:bg-white"
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('text-sm font-semibold capitalize', isCurrent ? 'text-blue-700' : 'text-slate-800')}>
                        {format(bucket.month, 'MMMM yyyy', { locale: es })}
                      </span>
                      {isCurrent && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">Este mes</span>}
                      {bucket.payments.length === 0 && <span className="text-xs text-slate-300">Sin cuotas</span>}
                    </div>

                    <div className="flex items-center gap-4">
                      {currencies.map(cur => {
                        const t = totals[cur]
                        return (
                          <div key={cur} className="flex items-center gap-2 text-xs">
                            <span className="text-slate-400 font-mono">{fmt(t.esperado, cur)}</span>
                            {t.cobrado > 0 && <span className="text-green-600 font-mono">✓{fmt(t.cobrado, cur)}</span>}
                            {t.vencido > 0 && <span className="text-red-500 font-mono">!{fmt(t.vencido, cur)}</span>}
                          </div>
                        )
                      })}
                      {bucket.payments.length > 0 && (
                        isCollapsed ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />
                      )}
                    </div>
                  </button>

                  {!isCollapsed && (
                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                      {bucket.payments.map(p => {
                        const isPaid    = !!p.fecha_pago
                        const isOverdue = !isPaid && p.fecha_vencimiento! < todayStr
                        return (
                          <div key={p.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-2">
                              <span className={cn(
                                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                                isPaid ? 'bg-green-500' : isOverdue ? 'bg-red-500' : 'bg-slate-300'
                              )} />
                              <div className="min-w-0">
                                <p className="text-sm text-slate-800 truncate">{p.cliente_nombre}</p>
                                <p className="text-xs text-slate-400 truncate">
                                  {p.descripcion} · {format(parseLocalDate(p.fecha_vencimiento!), 'd MMM', { locale: es })}
                                  {isPaid && p.fecha_pago && ` · cobrado ${format(parseLocalDate(p.fecha_pago), 'd MMM', { locale: es })}`}
                                </p>
                              </div>
                            </div>
                            <span className={cn(
                              'text-sm font-mono font-medium whitespace-nowrap',
                              isPaid ? 'text-green-600' : isOverdue ? 'text-red-500' : 'text-slate-700'
                            )}>
                              {fmt(p.monto, p.moneda)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
