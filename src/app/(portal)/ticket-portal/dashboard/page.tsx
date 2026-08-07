'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, LogOut, Clock, CheckCircle2, AlertCircle,
  ChevronRight, Loader2, Timer, MessageCircle,
} from 'lucide-react'
import type { TicketEstado, TicketPrioridad, TicketCategoria } from '@/types'

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
}

interface HoursData {
  plan_horas_mensual: number
  horas_consumidas: number
  horas_restantes: number
  porcentaje: number
  tickets_mes: { numero: string; titulo: string; horas_reales: number | null; resolved_at: string }[]
  mes: string
}

// ─── Helpers ─────────────────────────────────────────────────

const ESTADO_CONFIG: Record<TicketEstado, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  nuevo:       { label: 'Nuevo',       color: '#3b82f6', bg: '#eff6ff',  icon: AlertCircle  },
  en_progreso: { label: 'En progreso', color: '#f59e0b', bg: '#fffbeb',  icon: Clock        },
  en_espera:   { label: 'En espera',   color: '#f97316', bg: '#fff7ed',  icon: Clock        },
  resuelto:    { label: 'Resuelto',    color: '#22c55e', bg: '#f0fdf4',  icon: CheckCircle2 },
  cerrado:     { label: 'Cerrado',     color: '#94a3b8', bg: '#f8fafc',  icon: CheckCircle2 },
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
  otro:     'Otro',
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Hours Gauge ─────────────────────────────────────────────

function HoursGauge({ data, accentColor, nombrePlan }: { data: HoursData; accentColor: string; nombrePlan: string | null }) {
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
            : <span style={{ color: '#ef4444', fontWeight: 600 }}>Plan consumido</span>
          }
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: badgeBg, color: badgeText }}>
          {pct}%
        </span>
      </div>

      {data.tickets_mes.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Tickets resueltos este mes
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.tickets_mes.map(t => (
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
  )
}

// ─── Ticket Card ─────────────────────────────────────────────

function TicketCard({ ticket, onClick, accentColor }: { ticket: PortalTicket; onClick: () => void; accentColor: string }) {
  const ec = ESTADO_CONFIG[ticket.estado]
  const Icon = ec.icon
  const prioColor = PRIORIDAD_COLORS[ticket.prioridad]

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left',
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
        padding: '16px 18px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 14,
        transition: 'all .15s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = accentColor + '60'
        el.style.boxShadow = `0 4px 16px ${accentColor}20`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = '#e2e8f0'
        el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.03)'
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: ec.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={ec.color} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{ticket.numero}</span>
          <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 99, background: ec.bg, color: ec.color, fontWeight: 600 }}>
            {ec.label}
          </span>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: prioColor, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{CATEGORIA_LABELS[ticket.categoria]}</span>
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ticket.titulo}
        </p>
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
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
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        const [meRes, ticketsRes, hoursRes] = await Promise.all([
          fetch('/api/portal/auth/me'),
          fetch('/api/portal/my-tickets'),
          fetch('/api/portal/hours'),
        ])

        if (meRes.status === 401) {
          router.replace('/login')
          return
        }

        const [meData, ticketsData, hoursData] = await Promise.all([
          meRes.json(),
          ticketsRes.json(),
          hoursRes.json(),
        ])

        setClient(meData.data)
        setTickets(ticketsData.data ?? [])
        setHours(hoursData.data ?? null)
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
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)', fontSize: 13, cursor: 'pointer' }}
          >
            {loggingOut ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <LogOut size={13} />}
            Salir
          </button>
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

        {/* Hours gauge */}
        {hours && (
          <div style={{ marginBottom: 24 }}>
            <HoursGauge data={hours} accentColor={accentColor} nombrePlan={client?.nombre_plan ?? null} />
          </div>
        )}

        {/* Tickets header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 2px' }}>Mis tickets</h2>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
              {openTickets.length} abierto{openTickets.length !== 1 ? 's' : ''} · {resolvedTickets.length} resuelto{resolvedTickets.length !== 1 ? 's' : ''}
            </p>
          </div>
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
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {openTickets.length > 0 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px 4px' }}>
                  Abiertos
                </p>
                {openTickets.map(t => (
                  <TicketCard key={t.id} ticket={t} accentColor={accentColor} onClick={() => router.push(`/${t.ticket_token}`)} />
                ))}
              </>
            )}

            {resolvedTickets.length > 0 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: `${openTickets.length > 0 ? '16px' : '0px'} 0 4px 4px` }}>
                  Resueltos
                </p>
                {resolvedTickets.map(t => (
                  <TicketCard key={t.id} ticket={t} accentColor={accentColor} onClick={() => router.push(`/${t.ticket_token}`)} />
                ))}
              </>
            )}
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
      </main>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        * { box-sizing: border-box }
      `}</style>
    </div>
  )
}
