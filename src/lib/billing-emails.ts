import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { parseLocalDate, getDaysUntil } from './utils'

function fmt(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function fmtDate(d: string) {
  return format(parseLocalDate(d), "d 'de' MMMM 'de' yyyy", { locale: es })
}

// ─── Client-facing reminder ────────────────────────────────

export function buildClientReminderHtml({
  invoice,
  payment,
}: {
  invoice: {
    numero: string
    cliente_nombre: string
    moneda: string
    fecha_vencimiento?: string | null
    descripcion?: string | null
  }
  payment: {
    descripcion: string
    monto: number
    fecha_vencimiento?: string | null
    notas?: string | null
  }
}): string {
  const dueDate = payment.fecha_vencimiento
    ? `<p style="color:#64748b;font-size:14px;margin:4px 0 0">Vencimiento: <strong>${fmtDate(payment.fecha_vencimiento)}</strong></p>`
    : ''

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">

        <!-- Header -->
        <tr>
          <td style="background:#1e293b;padding:28px 36px">
            <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.5px">ALORA</h1>
            <p style="color:#94a3b8;margin:4px 0 0;font-size:13px">Agencia Digital</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px">
            <h2 style="color:#0f172a;font-size:18px;margin:0 0 8px;font-weight:600">
              Recordatorio de pago
            </h2>
            <p style="color:#64748b;font-size:15px;margin:0 0 28px;line-height:1.6">
              Hola <strong>${invoice.cliente_nombre}</strong>, te recordamos que tenés un pago pendiente.
            </p>

            <!-- Payment card -->
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin-bottom:28px">
              <p style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 6px;font-weight:600">
                Factura ${invoice.numero}
              </p>
              <p style="color:#0f172a;font-size:20px;font-weight:700;font-family:monospace;margin:0 0 4px">
                ${fmt(payment.monto, invoice.moneda)}
              </p>
              <p style="color:#64748b;font-size:14px;margin:4px 0 0">${payment.descripcion}</p>
              ${dueDate}
            </div>

            ${invoice.descripcion ? `<p style="color:#64748b;font-size:14px;margin:0 0 24px;padding:14px 18px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:0 8px 8px 0">${invoice.descripcion}</p>` : ''}

            <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 24px">
              Para coordinar el pago, comunicate con nosotros respondiendo este email o escribinos a <a href="mailto:info@globalalora.com" style="color:#3b82f6;text-decoration:none">info@globalalora.com</a>.
            </p>

            ${payment.notas ? `<p style="color:#64748b;font-size:13px;font-style:italic;margin:0 0 24px">${payment.notas}</p>` : ''}

            <hr style="border:none;border-top:1px solid #f1f5f9;margin:0 0 20px">
            <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center">
              Alora Agencia Digital · info@globalalora.com<br>
              Este es un recordatorio automático generado por Alora CRM.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ─── Internal team alert ───────────────────────────────────

export function buildInternalAlertHtml({
  invoices,
}: {
  invoices: {
    invoice: {
      id: string
      numero: string
      cliente_nombre: string
      cliente_email?: string | null
      moneda: string
    }
    payments: {
      id: string
      descripcion: string
      monto: number
      fecha_vencimiento?: string | null
      fecha_pago?: string | null
      alerta_enviada_at?: string | null
    }[]
  }[]
}): string {
  const rows = invoices.flatMap(({ invoice, payments }) =>
    payments.map(p => {
      const isOverdue = !!p.fecha_vencimiento && !p.fecha_pago && getDaysUntil(p.fecha_vencimiento) < 0
      const color     = isOverdue ? '#ef4444' : '#f59e0b'
      const label     = isOverdue ? 'VENCIDA' : 'PRÓXIMA'
      return `
        <tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:12px 16px;font-size:14px;color:#0f172a;font-weight:600">${invoice.cliente_nombre}</td>
          <td style="padding:12px 16px;font-size:13px;color:#64748b;font-family:monospace">${invoice.numero}</td>
          <td style="padding:12px 16px;font-size:14px;color:#0f172a;font-family:monospace;font-weight:600">${fmt(p.monto, invoice.moneda)}</td>
          <td style="padding:12px 16px;font-size:13px;color:#64748b">${p.fecha_vencimiento ? fmtDate(p.fecha_vencimiento) : '—'}</td>
          <td style="padding:12px 16px">
            <span style="background:${color}20;color:${color};font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px">${label}</span>
          </td>
        </tr>`
    })
  ).join('')

  const total = invoices.length
  const now   = format(new Date(), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:12px;overflow:hidden">

        <tr>
          <td style="background:#1e293b;padding:24px 32px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <h1 style="color:#fff;margin:0;font-size:18px;font-weight:700">Alertas de facturación</h1>
              <p style="color:#94a3b8;margin:4px 0 0;font-size:12px">${now} · ${total} factura${total !== 1 ? 's' : ''}</p>
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 32px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
              <thead>
                <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
                  <th style="text-align:left;padding:10px 16px;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Cliente</th>
                  <th style="text-align:left;padding:10px 16px;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Factura</th>
                  <th style="text-align:left;padding:10px 16px;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Monto</th>
                  <th style="text-align:left;padding:10px 16px;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Vencimiento</th>
                  <th style="text-align:left;padding:10px 16px;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Estado</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>

            <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;text-align:center">
              Alora CRM · Reporte automático de pagos
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
