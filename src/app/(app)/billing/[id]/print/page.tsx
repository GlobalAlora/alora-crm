'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Loader2, Printer } from 'lucide-react'
import type { Invoice, InvoiceEstado } from '@/types'
import { parseLocalDate } from '@/lib/utils'

const ESTADO_LABELS: Record<InvoiceEstado, string> = {
  borrador:             'Borrador',
  enviada:              'Enviada',
  parcialmente_pagada:  'Pago parcial',
  pagada:               'Pagada',
  vencida:              'Vencida',
  cancelada:            'Cancelada',
}

const METODO_LABELS: Record<string, string> = {
  transferencia: 'Transferencia bancaria',
  efectivo:      'Efectivo',
  mercadopago:   'MercadoPago',
  paypal:        'PayPal',
  otro:          'Otro',
}

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

async function fetchInvoice(id: string): Promise<{ data: Invoice }> {
  const r = await fetch(`/api/invoices/${id}`)
  if (!r.ok) throw new Error('No encontrada')
  return r.json()
}

export default function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn:  () => fetchInvoice(id),
  })

  const inv = data?.data

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={24} className="animate-spin text-slate-400" />
      </div>
    )
  }

  if (!inv) {
    return <div className="flex items-center justify-center min-h-screen text-slate-500">Factura no encontrada</div>
  }

  const total       = inv.total ?? 0
  const totalPagado = inv.total_pagado ?? 0
  const items       = inv.items ?? []
  const payments    = inv.payments ?? []

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          * { box-shadow: none !important; }
        }
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; margin: 0; background: #f1f5f9; }
      `}</style>

      {/* Print button */}
      <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors"
        >
          <Printer size={15} />
          Imprimir / Guardar PDF
        </button>
        <button
          onClick={() => window.close()}
          className="text-slate-600 bg-white text-sm px-4 py-2 rounded-lg shadow-lg border border-slate-200 hover:bg-slate-50"
        >
          Cerrar
        </button>
      </div>

      {/* Invoice */}
      <div className="min-h-screen bg-slate-100 py-10 px-4">
        <div className="max-w-[720px] mx-auto bg-white shadow-xl" style={{ borderRadius: 8 }}>
          {/* Header band */}
          <div style={{ background: '#1e293b', borderRadius: '8px 8px 0 0', padding: '32px 40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ color: 'white', fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>
                  ALORA
                </h1>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>Agencia Digital</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#94a3b8', fontSize: 11, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Factura
                </p>
                <p style={{ color: 'white', fontSize: 22, fontWeight: 700, fontFamily: 'monospace', margin: 0 }}>
                  {inv.numero}
                </p>
                <span style={{
                  display: 'inline-block', marginTop: 8,
                  background: inv.estado === 'pagada' ? '#22c55e' : inv.estado === 'vencida' ? '#ef4444' : '#3b82f6',
                  color: 'white', fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 99,
                }}>
                  {ESTADO_LABELS[inv.estado]}
                </span>
              </div>
            </div>
          </div>

          <div style={{ padding: '32px 40px' }}>
            {/* Dates + client row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32 }}>
              <div>
                <p style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>
                  Para
                </p>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{inv.cliente_nombre}</p>
                {inv.cliente_email && (
                  <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{inv.cliente_email}</p>
                )}
                {inv.project && (
                  <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0 0' }}>
                    Proyecto: {inv.project.nombre}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>
                    Fecha de emisión
                  </p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>
                    {format(parseLocalDate(inv.fecha_emision), "d 'de' MMMM, yyyy", { locale: es })}
                  </p>
                </div>
                {inv.fecha_vencimiento && (
                  <div>
                    <p style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>
                      Vencimiento
                    </p>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>
                      {format(parseLocalDate(inv.fecha_vencimiento), "d 'de' MMMM, yyyy", { locale: es })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            {inv.descripcion && (
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px', marginBottom: 28 }}>
                <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>{inv.descripcion}</p>
              </div>
            )}

            {/* Items */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                  <th style={{ textAlign: 'left', fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 0' }}>
                    Descripción
                  </th>
                  <th style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 12px' }}>
                    Cant.
                  </th>
                  <th style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 12px' }}>
                    Precio unit.
                  </th>
                  <th style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '8px 0' }}>
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={it.id} style={{ borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <td style={{ fontSize: 14, color: '#1e293b', padding: '12px 0' }}>{it.descripcion}</td>
                    <td style={{ fontSize: 13, color: '#64748b', textAlign: 'center', padding: '12px', fontFamily: 'monospace' }}>
                      {it.cantidad}
                    </td>
                    <td style={{ fontSize: 13, color: '#64748b', textAlign: 'right', padding: '12px', fontFamily: 'monospace' }}>
                      {fmt(it.precio_unitario, inv.moneda)}
                    </td>
                    <td style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', textAlign: 'right', padding: '12px 0', fontFamily: 'monospace' }}>
                      {fmt(it.cantidad * it.precio_unitario, inv.moneda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
              <div style={{ minWidth: 220 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Subtotal</span>
                  <span style={{ fontSize: 13, color: '#1e293b', fontFamily: 'monospace' }}>{fmt(total, inv.moneda)}</span>
                </div>
                {totalPagado > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ fontSize: 13, color: '#64748b' }}>Cobrado</span>
                    <span style={{ fontSize: 13, color: '#22c55e', fontFamily: 'monospace' }}>-{fmt(totalPagado, inv.moneda)}</span>
                  </div>
                )}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', padding: '10px 14px',
                  background: '#1e293b', borderRadius: 8, marginTop: 8,
                }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>
                    {totalPagado > 0 ? 'Saldo pendiente' : 'Total'}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>
                    {fmt(total - totalPagado, inv.moneda)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment schedule */}
            {payments.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, margin: '0 0 12px' }}>
                  Plan de pagos
                </p>
                <div style={{ border: '1px solid #f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                  {payments.map((p, idx) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '10px 14px',
                        borderBottom: idx < payments.length - 1 ? '1px solid #f1f5f9' : 'none',
                        background: p.fecha_pago ? '#f0fdf4' : 'white',
                      }}
                    >
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginRight: 12,
                        background: p.fecha_pago ? '#22c55e' : '#e2e8f0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {p.fecha_pago && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{p.descripcion}</span>
                        {p.fecha_vencimiento && (
                          <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>
                            Vence {format(parseLocalDate(p.fecha_vencimiento), "d MMM yyyy", { locale: es })}
                          </span>
                        )}
                        {p.fecha_pago && (
                          <span style={{ fontSize: 11, color: '#22c55e', marginLeft: 8 }}>
                            Pagado {format(parseLocalDate(p.fecha_pago), "d MMM yyyy", { locale: es })}
                            {p.metodo_pago && ` · ${METODO_LABELS[p.metodo_pago] ?? p.metodo_pago}`}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', fontFamily: 'monospace' }}>
                        {fmt(p.monto, inv.moneda)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {inv.notas && (
              <div style={{ background: '#fffbeb', borderLeft: '3px solid #f59e0b', padding: '10px 14px', borderRadius: '0 6px 6px 0', marginBottom: 24 }}>
                <p style={{ fontSize: 12, color: '#92400e', fontWeight: 600, margin: '0 0 4px' }}>Notas</p>
                <p style={{ fontSize: 13, color: '#78350f', margin: 0 }}>{inv.notas}</p>
              </div>
            )}

            {/* Footer */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 2px' }}>
                Generado por Alora CRM · {format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}
              </p>
              <p style={{ fontSize: 11, color: '#cbd5e1', margin: 0 }}>conocealidia@gmail.com</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
