'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, LogOut, Clock, CheckCircle2, AlertCircle,
  ChevronRight, Loader2, Timer, MessageCircle, KeyRound, X, Eye, EyeOff, Search, ChevronDown,
  FileText, Download,
} from 'lucide-react'
import type { TicketEstado, TicketPrioridad, TicketCategoria } from '@/types'
import { extraHourPrice, formatARS } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────

interface PortalClient {
  id: string
  email: string
  nombre: string
  empresa: string | null
  plan_horas_mensual: number
  color_acento: string | null
  nombre_plan: string | null
  mensaje_bienvenida: string | null
  logo_url: string | null
  manager_nombre: string | null
  manager_avatar: string | null
}

interface PortalTicket {
  id: string
  numero: string
  titulo: string
  estado: TicketEstado
  prioridad: TicketPrioridad
  categoria: TicketCategoria
  created_at: string
  resolved_at: string | null
  ticket_token: string
  horas_estimadas: number | null
  horas_reales: number | null
  horas_aprobadas: boolean | null
  client_unread: boolean
}

interface HoursData {
  plan_horas_mensual: number
  horas_consumidas: number
  horas_restantes: number
  horas_extra: number
  porcentaje: number
  tickets_resueltos: { numero: string; titulo: string; horas_reales: number | null; resolved_at: string }[]
  tickets_abiertos:  { numero: string; titulo: string; horas_estimadas: number | null; horas_aprobadas: boolean | null }[]
  mes: string
  historial: { mes: string; horas_consumidas: number; plan_horas_mensual: number; porcentaje: number }[]
}

// ─── Helpers ─────────────────────────────────────────────────

const ESTADO_CONFIG: Record<TicketEstado, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  nuevo:           { label: 'Nuevo',            color: '#3b82f6', bg: '#eff6ff',  icon: AlertCircle  },
  en_progreso:     { label: 'En progreso',      color: '#f59e0b', bg: '#fffbeb',  icon: Clock        },
  en_espera:       { label: 'En espera',        color: '#f97316', bg: '#fff7ed',  icon: Clock        },
  estimacion:      { label: 'Estimado',          color: '#8b5cf6', bg: '#f5f3ff',  icon: Clock        },
  resuelto:        { label: 'Resuelto',         color: '#22c55e', bg: '#f0fdf4',  icon: CheckCircle2 },
  cerrado:         { label: 'Cerrado',          color: '#94a3b8', bg: '#f8fafc',  icon: CheckCircle2 },
}

const PRIORIDAD_COLORS: Record<TicketPrioridad, string> = {
  baja:    '#94a3b8',
  media:   '#3b82f6',
  alta:    '#f97316',
  urgente: '#ef4444',
}

const CATEGORIA_LABELS: Record<TicketCategoria, string> = {
  bug:      'Bug',
  soporte:  'Soporte',
  consulta: 'Consulta',
  mejora:   'Mejora',
  nuevo:    'Nuevo desarrollo',
  otro:     'Otro',
}

interface MaintenanceReport {
  id: string
  titulo: string
  mes: string
  contenido: string | null
  archivo_url: string | null
  archivo_nombre: string | null
  created_at: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatMes(mes: string) {
  const [y, m] = mes.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

// ─── Hours Gauge ─────────────────────────────────────────────

function HoursGauge({ data, accentColor, nombrePlan }: { data: HoursData; accentColor: string; nombrePlan: string | null }) {
  const [showHistorial, setShowHistorial] = useState(false)
  const pct = data.porcentaje
  const barColor  = pct < 70 ? accentColor : pct < 90 ? '#f59e0b' : '#ef4444'
  const badgeBg   = pct < 70 ? `${accentColor}18` : pct < 90 ? '#fffbeb' : '#fef2f2'
  const badgeText = pct < 70 ? accentColor        : pct < 90 ? '#b45309' : '#dc2626'

  return (
    <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Timer size={16} color="#64748b" />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Horas del mes
        </span>
        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto', textTransform: 'capitalize' }}>
          {nombrePlan ? `${nombrePlan} · ${data.mes}` : data.mes}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
        <span style={{ fontSize: 42, fontWeight: 800, color: '#0f172a', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {data.horas_consumidas % 1 === 0 ? data.horas_consumidas : data.horas_consumidas.toFixed(1)}
        </span>
        <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 500 }}>
          / {data.plan_horas_mensual} hs
        </span>
      </div>

      <div style={{ height: 10, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 99, transition: 'width .6s ease' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          {data.horas_restantes > 0
            ? <><strong style={{ color: '#0f172a' }}>{data.horas_restantes % 1 === 0 ? data.horas_restantes : data.horas_restantes.toFixed(1)} hs</strong> restantes</>
            : data.horas_extra > 0
              ? <><span style={{ color: '#ef4444', fontWeight: 600 }}>Plan agotado</span><span style={{ color: '#ef4444' }}> · {data.horas_extra % 1 === 0 ? data.horas_extra : data.horas_extra.toFixed(1)} hs adicionales · </span><span style={{ color: '#ef4444', fontWeight: 700 }}>${formatARS(data.horas_extra * extraHourPrice())} a facturar aparte</span><span style={{ color: '#94a3b8', fontSize: 11 }}> (${formatARS(extraHourPrice())}/hs)</span></>
              : <span style={{ color: '#ef4444', fontWeight: 600 }}>Plan agotado</span>
          }
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: badgeBg, color: badgeText }}>
          {pct}%
        </span>
      </div>

      {/* Pending approval notice */}
      {(() => {
        const pendingTickets = data.tickets_abiertos.filter(t => !t.horas_aprobadas && t.horas_estimadas != null)
        const pendingHoras = pendingTickets.reduce((s, t) => s + Number(t.horas_estimadas), 0)
        if (pendingHoras === 0) return null
        const overage = Math.max(0, data.horas_consumidas + pendingHoras - data.plan_horas_mensual)
        return (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>
              ⏳ {pendingHoras % 1 === 0 ? pendingHoras : pendingHoras.toFixed(1)} hs pendientes de aprobación
            </span>
            {overage > 0 && (
              <span style={{ fontSize: 12, color: '#92400e' }}>
                Si se aprueban, se excederá el plan por <strong>{overage % 1 === 0 ? overage : overage.toFixed(1)} hs</strong> que se facturarán.
              </span>
            )}
          </div>
        )
      })()}

      {/* History accordion */}
      {data.historial && data.historial.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
          <button
            onClick={() => setShowHistorial(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', justifyContent: 'space-between' }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Historial de horas</span>
            <ChevronDown size={14} color="#94a3b8" style={{ transform: showHistorial ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }} />
          </button>
          {showHistorial && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.historial.map(h => {
                const hPct = h.porcentaje
                const hBar = hPct < 70 ? accentColor : hPct < 90 ? '#f59e0b' : '#ef4444'
                return (
                  <div key={h.mes}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#475569', textTransform: 'capitalize' }}>{h.mes}</span>
                      <span style={{ fontSize: 12, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                        {h.horas_consumidas % 1 === 0 ? h.horas_consumidas : h.horas_consumidas.toFixed(1)} / {h.plan_horas_mensual} hs
                      </span>
                    </div>
                    <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${hPct}%`, background: hBar, borderRadius: 99 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {(data.tickets_resueltos.length > 0 || data.tickets_abiertos.length > 0) && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.tickets_abiertos.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Tickets en curso este mes
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.tickets_abiertos.map(t => (
                  <div key={t.numero} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{t.numero}</span>
                    <span style={{ fontSize: 12, color: '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.titulo}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', color: t.horas_aprobadas ? '#64748b' : '#b45309' }}>
                      {t.horas_estimadas != null ? `~${t.horas_estimadas} hs${!t.horas_aprobadas ? ' ⏳' : ''}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.tickets_resueltos.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Tickets resueltos este mes
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.tickets_resueltos.map(t => (
                  <div key={t.numero} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{t.numero}</span>
                    <span style={{ fontSize: 12, color: '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.titulo}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {t.horas_reales != null ? `${t.horas_reales} hs` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Ticket Card ─────────────────────────────────────────────

// ─── Change Password Modal ───────────────────────────────────

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [showCur,  setShowCur]  = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [ok,       setOk]       = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/portal/auth/change-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ current_password: current, new_password: next }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error'); return }
      setOk(true)
    } catch { setError('Error de conexión') }
    finally { setLoading(false) }
  }

  const inputS: React.CSSProperties = {
    width: '100%', padding: '10px 44px 10px 14px', borderRadius: 10,
    border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 14,
    color: '#0f172a', outline: 'none',
  }
  const eyeS: React.CSSProperties = {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 400, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Cambiar contraseña</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
        </div>

        {ok ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <p style={{ fontSize: 15, color: '#16a34a', fontWeight: 600, margin: '0 0 8px' }}>¡Contraseña actualizada!</p>
            <button onClick={onClose} style={{ marginTop: 12, padding: '10px 24px', borderRadius: 10, border: 'none', background: '#0f172a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>{error}</div>}

            {[
              { label: 'Contraseña actual', value: current, set: setCurrent, show: showCur, toggle: () => setShowCur(v => !v) },
              { label: 'Nueva contraseña',  value: next,    set: setNext,    show: showNext, toggle: () => setShowNext(v => !v) },
            ].map(({ label, value, set, show, toggle }) => (
              <div key={label}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</label>
                <div style={{ position: 'relative' }}>
                  <input required type={show ? 'text' : 'password'} value={value} onChange={e => set(e.target.value)} style={inputS} />
                  <button type="button" onClick={toggle} style={eyeS}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
                {label.startsWith('Nueva') && value.length > 0 && value.length < 8 && (
                  <p style={{ fontSize: 11, color: '#f97316', marginTop: 4 }}>Mínimo 8 caracteres</p>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
              <button type="submit" disabled={loading || next.length < 8} style={{ flex: 1, padding: '11px 16px', borderRadius: 10, border: 'none', background: (loading || next.length < 8) ? '#94a3b8' : '#0f172a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading || next.length < 8 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {loading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</> : 'Guardar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Ticket Card ─────────────────────────────────────────────

function TicketCard({ ticket, onClick, accentColor }: { ticket: PortalTicket; onClick: () => void; accentColor: string }) {
  const ec = ESTADO_CONFIG[ticket.estado]
  const Icon = ec.icon
  const prioColor = PRIORIDAD_COLORS[ticket.prioridad]
  const needsApproval = ticket.horas_estimadas != null && !ticket.horas_aprobadas && !['resuelto', 'cerrado'].includes(ticket.estado)
  const borderColor = needsApproval ? '#f59e0b' : ticket.client_unread ? '#3b82f6' : '#e2e8f0'

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left',
        background: '#fff', border: `1px solid ${borderColor}`, borderRadius: 14,
        padding: '16px 18px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 14,
        transition: 'all .15s',
        boxShadow: needsApproval
          ? '0 2px 8px rgba(245,158,11,0.12)'
          : ticket.client_unread
            ? '0 2px 8px rgba(59,130,246,0.12)'
            : '0 1px 4px rgba(0,0,0,0.03)',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = accentColor + '80'
        el.style.boxShadow = `0 4px 16px ${accentColor}20`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = borderColor
        el.style.boxShadow = needsApproval
          ? '0 2px 8px rgba(245,158,11,0.12)'
          : ticket.client_unread
            ? '0 2px 8px rgba(59,130,246,0.12)'
            : '0 1px 4px rgba(0,0,0,0.03)'
      }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: ec.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={ec.color} />
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{ticket.numero}</span>
          <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: ec.bg, color: ec.color, fontWeight: 600 }}>
            {ec.label}
          </span>
          {needsApproval && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#fffbeb', color: '#b45309', fontWeight: 700, border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 3 }}>
              ⏱ Aprobación requerida
            </span>
          )}
          {ticket.client_unread && !needsApproval && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 3 }}>
              💬 Nueva respuesta
            </span>
          )}
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.titulo}
        </p>
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0' }}>
          {ticket.resolved_at
            ? `Resuelto el ${formatDate(ticket.resolved_at)}`
            : `Abierto el ${formatDate(ticket.created_at)}`
          }
          {ticket.horas_estimadas != null && (
            <span style={{ marginLeft: 8, color: '#cbd5e1' }}>· {ticket.horas_estimadas} hs estimadas</span>
          )}
        </p>
      </div>

      <ChevronRight size={16} color="#cbd5e1" style={{ flexShrink: 0 }} />
    </button>
  )
}

// ─── Page ────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [client, setClient]   = useState<PortalClient | null>(null)
  const [tickets, setTickets] = useState<PortalTicket[]>([])
  const [hours, setHours]     = useState<HoursData | null>(null)
  const [reports, setReports] = useState<MaintenanceReport[]>([])
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [filtro, setFiltro]   = useState<'todos' | 'nuevos' | 'en_progreso' | 'resueltos'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [selectedReport, setSelectedReport] = useState<MaintenanceReport | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [meRes, ticketsRes, hoursRes, reportsRes] = await Promise.all([
          fetch('/api/portal/auth/me'),
          fetch('/api/portal/my-tickets'),
          fetch('/api/portal/hours'),
          fetch('/api/portal/maintenance-reports'),
        ])

        if (meRes.status === 401) {
          router.replace('/login')
          return
        }

        const [meData, ticketsData, hoursData, reportsData] = await Promise.all([
          meRes.json(),
          ticketsRes.json(),
          hoursRes.json(),
          reportsRes.json(),
        ])

        setClient(meData.data)
        setTickets(ticketsData.data ?? [])
        setHours(hoursData.data ?? null)
        setReports(reportsData.data ?? [])
        setLoading(false)
      } catch {
        router.replace('/login')
      }
    }
    loadData()
  }, [router])

  async function handleLogout() {
    setLoggingOut(true)
    await fetch('/api/portal/auth/logout', { method: 'POST' })
    router.replace('/login')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} color="#64748b" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    )
  }

  const openTickets     = tickets.filter(t => !['resuelto', 'cerrado'].includes(t.estado))
  const resolvedTickets = tickets.filter(t => ['resuelto', 'cerrado'].includes(t.estado))

  const headerBg    = client?.color_acento ?? '#0f172a'
  const accentColor = client?.color_acento ?? '#3b82f6'

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <header style={{ background: headerBg }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          {client?.logo_url ? (
            <img
              src={client.logo_url}
              alt={client.empresa ?? 'Logo'}
              style={{ height: 32, objectFit: 'contain', maxWidth: 120 }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <img src="/logo-nav-white.png" alt="Alora" style={{ height: 32, objectFit: 'contain' }} />
          )}
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', margin: 0 }}>{client?.nombre}</p>
            {client?.empresa && (
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', margin: 0 }}>{client.empresa}</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowChangePwd(true)}
              title="Cambiar contraseña"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}
            >
              <KeyRound size={14} />
            </button>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)', fontSize: 13, cursor: 'pointer' }}
            >
              {loggingOut ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <LogOut size={13} />}
              Salir
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Welcome message */}
        {client?.mensaje_bienvenida && (
          <div style={{ background: `${accentColor}12`, border: `1px solid ${accentColor}30`, borderRadius: 14, padding: '14px 18px', marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <MessageCircle size={16} color={accentColor} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: '#334155', margin: 0, lineHeight: 1.6 }}>{client.mensaje_bienvenida}</p>
          </div>
        )}

        {/* Attention banners */}
        {(() => {
          const pendingApproval = tickets.filter(t => t.horas_estimadas != null && !t.horas_aprobadas && !['resuelto', 'cerrado'].includes(t.estado))
          const unreadTickets   = tickets.filter(t => t.client_unread)
          return (
            <>
              {pendingApproval.length > 0 && (
                <div style={{ marginBottom: 16, padding: '14px 18px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>⏱</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#92400e', margin: '0 0 6px' }}>
                      {pendingApproval.length === 1
                        ? 'Tenés una estimación de horas pendiente de aprobación'
                        : `Tenés ${pendingApproval.length} estimaciones de horas pendientes de aprobación`}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {pendingApproval.map(t => (
                        <button
                          key={t.id}
                          onClick={() => router.push(`/${t.ticket_token}`)}
                          style={{ textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#b45309' }}>{t.numero}</span>
                          <span style={{ fontSize: 12, color: '#92400e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{t.titulo}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309', flexShrink: 0 }}>— {t.horas_estimadas} hs</span>
                          <span style={{ fontSize: 11, color: '#d97706', textDecoration: 'underline', flexShrink: 0 }}>Aprobar →</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {unreadTickets.length > 0 && (
                <div style={{ marginBottom: 16, padding: '12px 18px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <MessageCircle size={15} color="#1d4ed8" style={{ flexShrink: 0 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1e40af', margin: 0, flex: 1 }}>
                    {unreadTickets.length === 1
                      ? 'Tenés una respuesta nueva en un ticket'
                      : `Tenés respuestas nuevas en ${unreadTickets.length} tickets`}
                  </p>
                </div>
              )}
            </>
          )
        })()}

        {/* Tickets header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Mis tickets</h2>
          <button
            onClick={() => router.push('/nuevo')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: accentColor, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={15} /> Nuevo ticket
          </button>
        </div>

        {/* Search */}
        {tickets.length > 0 && (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar ticket..."
              style={{
                width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, border: '1px solid #e2e8f0',
                background: '#fff', fontSize: 13, color: '#0f172a', outline: 'none',
              }}
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Filter tabs */}
        {tickets.length > 0 && (() => {
          const base = busqueda.trim() ? tickets.filter(t => t.titulo.toLowerCase().includes(busqueda.toLowerCase())) : tickets
          const tabs: { key: typeof filtro; label: string; count: number }[] = [
            { key: 'todos',       label: 'Todos',       count: base.length },
            { key: 'nuevos',      label: 'Nuevos',      count: base.filter(t => t.estado === 'nuevo').length },
            { key: 'en_progreso', label: 'En progreso', count: base.filter(t => ['en_progreso', 'en_espera'].includes(t.estado)).length },
            { key: 'resueltos',   label: 'Cerrados',    count: base.filter(t => ['resuelto', 'cerrado'].includes(t.estado)).length },
          ]
          return (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 2 }}>
              {tabs.map(tab => {
                const active = filtro === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => setFiltro(tab.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 99, border: active ? 'none' : '1px solid #e2e8f0',
                      background: active ? accentColor : '#fff',
                      color: active ? '#fff' : '#64748b',
                      fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap',
                      transition: 'all .15s',
                    }}
                  >
                    {tab.label}
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      background: active ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
                      color: active ? '#fff' : '#94a3b8',
                      borderRadius: 99, padding: '1px 7px',
                    }}>
                      {tab.count}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })()}

        {/* Ticket list */}
        {tickets.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 15, color: '#94a3b8', margin: '0 0 16px' }}>Todavía no tenés tickets</p>
            <button
              onClick={() => router.push('/nuevo')}
              style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: accentColor, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Crear primer ticket
            </button>
          </div>
        ) : (() => {
          const base     = busqueda.trim() ? tickets.filter(t => t.titulo.toLowerCase().includes(busqueda.toLowerCase())) : tickets
          const filtered = filtro === 'todos'       ? base
                         : filtro === 'nuevos'      ? base.filter(t => t.estado === 'nuevo')
                         : filtro === 'en_progreso' ? base.filter(t => ['en_progreso', 'en_espera'].includes(t.estado))
                         : base.filter(t => ['resuelto', 'cerrado'].includes(t.estado))

          if (filtered.length === 0) {
            return (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '32px 24px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>No hay tickets en esta categoría</p>
              </div>
            )
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(t => (
                <TicketCard key={t.id} ticket={t} accentColor={accentColor} onClick={() => router.push(`/${t.ticket_token}`)} />
              ))}
            </div>
          )
        })()}

        {/* Hours gauge — solo plan premium (plan_horas_mensual > 0) */}
        {hours && hours.plan_horas_mensual > 0 && (
          <div style={{ marginTop: 32 }}>
            <HoursGauge data={hours} accentColor={accentColor} nombrePlan={client?.nombre_plan ?? null} />
          </div>
        )}

        {/* Manager contact */}
        {client?.manager_nombre && (
          <div style={{ marginTop: 32, padding: '16px 20px', background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
            {client.manager_avatar ? (
              <img
                src={client.manager_avatar}
                alt={client.manager_nombre}
                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {client.manager_nombre[0].toUpperCase()}
              </div>
            )}
            <div>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
                Tu contacto en Alora
              </p>
              <p style={{ fontSize: 14, color: '#0f172a', fontWeight: 600, margin: 0 }}>{client.manager_nombre}</p>
            </div>
          </div>
        )}

        {/* Maintenance reports */}
        {reports.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <FileText size={15} color="#64748b" />
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Reportes de mantenimiento</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reports.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelectedReport(r)}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
                    padding: '14px 16px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = accentColor + '60' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0' }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${accentColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileText size={16} color={accentColor} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, textTransform: 'capitalize' }}>{formatMes(r.mes)}</p>
                  </div>
                  {r.archivo_url && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 99, background: '#f1f5f9', flexShrink: 0 }}>
                      <Download size={11} color="#64748b" />
                      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>PDF</span>
                    </div>
                  )}
                  <ChevronRight size={15} color="#cbd5e1" style={{ flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Report detail modal */}
      {selectedReport && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', padding: 16 }} onClick={() => setSelectedReport(null)}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.06em', margin: '0 0 4px' }}>{formatMes(selectedReport.mes)}</p>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: 0 }}>{selectedReport.titulo}</h2>
              </div>
              <button onClick={() => setSelectedReport(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0, marginTop: 2 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: 24 }}>
              {selectedReport.contenido && (
                <div style={{ marginBottom: selectedReport.archivo_url ? 20 : 0 }}>
                  <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{selectedReport.contenido}</p>
                </div>
              )}
              {!selectedReport.contenido && !selectedReport.archivo_url && (
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Sin descripción adicional.</p>
              )}
              {selectedReport.archivo_url && (
                <a
                  href={selectedReport.archivo_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '14px 18px', borderRadius: 12,
                    background: accentColor, color: '#fff',
                    textDecoration: 'none', fontWeight: 600, fontSize: 14,
                  }}
                >
                  <Download size={16} />
                  Descargar {selectedReport.archivo_nombre ?? 'archivo'}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        * { box-sizing: border-box }
      `}</style>

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
    </div>
  )
}
