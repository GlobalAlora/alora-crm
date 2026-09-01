'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, Users, Settings, FileCode2, CheckSquare, Mail, Tag, List,
  MessageCircle, Smartphone, ContactRound, X, Menu, UserCog, Bot, FolderKanban,
  ShieldCheck, Receipt, Ticket, BarChart2, Globe, Zap, FileText, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import type { WhatsAppConversation } from '@/types'
import { PushSubscription } from '@/components/PushSubscription'

// ─── constants ─────────────────────────────────────────────
const FULL_ACCESS_ROLES = ['admin', 'sales']

const FULL_NAV = [
  { href: '/dashboard',     label: 'Dashboard',       icon: LayoutDashboard, badge: null, sub: undefined },
  { href: '/contactos',     label: 'Leads',            icon: ContactRound,    badge: null, sub: undefined },
  {
    href: '/leads',
    label: 'Pipeline',
    icon: Users,
    badge: null,
    sub: [{ href: '/leads/tareas', label: 'Tareas', icon: CheckSquare }],
  },
  { href: '/inbox/whatsapp', label: 'WhatsApp',        icon: MessageCircle,  badge: null, sub: undefined },
  // Email Marketing: oculto del menú por ahora (no se usa) — feature y ruta siguen intactas, no reactivar sin pedir confirmación.
  // { href: '/email',          label: 'Email Marketing', icon: Mail,           badge: null, sub: undefined },
  { href: '/projects',       label: 'Proyectos',       icon: FolderKanban,   badge: null, sub: undefined },
  { href: '/billing',        label: 'Facturación',     icon: Receipt,        badge: null, sub: undefined },
  { href: '/presupuestador', label: 'Presupuestador',  icon: Sparkles,       badge: null, sub: undefined },
  { href: '/tickets',        label: 'Tickets',          icon: Ticket,         badge: null, sub: undefined },
]

const VIEWER_NAV = [
  { href: '/projects', label: 'Proyectos', icon: FolderKanban, badge: null, sub: undefined },
]

const SETTINGS_NAV = [
  { href: '/settings/usuarios',    label: 'Usuarios',      icon: ShieldCheck    },
  { href: '/settings/equipo',      label: 'Equipo',        icon: UserCog        },
  { href: '/settings/pipeline',    label: 'Pipeline',      icon: LayoutDashboard },
  { href: '/settings/forms',       label: 'Formularios',   icon: FileCode2      },
  { href: '/settings/tags',        label: 'Etiquetas',     icon: Tag            },
  { href: '/settings/lists',       label: 'Listas',        icon: List           },
  { href: '/settings/whatsapp',    label: 'WhatsApp',      icon: Smartphone     },
  { href: '/settings/whatsapp-faqs', label: 'FAQs Lidia',  icon: Bot            },
  { href: '/settings/whatsapp-portfolio', label: 'Portfolio Lidia', icon: BarChart2 },
  { href: '/settings/portal-clientes',      label: 'Portal clientes',   icon: Globe },
  { href: '/settings/respuestas-rapidas',      label: 'Respuestas rápidas',       icon: Zap      },
  { href: '/settings/reportes-mantenimiento', label: 'Reportes mantenimiento',    icon: FileText },
]

// ─── helpers ───────────────────────────────────────────────
function avatarInitials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

// ─── NavContent ────────────────────────────────────────────
interface NavContentProps {
  pathname:    string
  nav:         typeof FULL_NAV
  inSettings:  boolean
  isAdmin:     boolean
  totalUnread: number
  me:          { full_name: string; avatar_url: string | null; role: string; email: string } | null
  onCloseMobile: () => void
}

function NavContent({ pathname, nav, inSettings, isAdmin, totalUnread, me, onCloseMobile }: NavContentProps) {
  const navWithBadge = nav.map(n =>
    n.href === '/inbox/whatsapp' ? { ...n, badge: totalUnread || null } : n
  )

  return (
    <>
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
        <Image src="/logo-nav-white.png" alt="Alora" width={100} height={28} priority />
        <button onClick={onCloseMobile} className="md:hidden text-slate-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navWithBadge.map(({ href, label, icon: Icon, badge, sub }) => {
          const isActive = pathname.startsWith(href)
          return (
            <div key={href}>
              <Link
                href={href}
                onClick={onCloseMobile}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                )}
              >
                <Icon size={16} />
                <span className="flex-1">{label}</span>
                {badge != null && badge > 0 && (
                  <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-green-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </Link>

              {sub && isActive && (
                <div className="pl-4 mt-0.5 space-y-0.5">
                  {sub.map(({ href: sh, label: sl, icon: SI }) => (
                    <Link
                      key={sh}
                      href={sh}
                      onClick={onCloseMobile}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                        pathname.startsWith(sh) ? 'text-white bg-slate-700' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      )}
                    >
                      <SI size={13} />
                      {sl}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="px-3 pb-4 border-t border-slate-800 pt-4 space-y-1">
        {/* Settings (admin only) */}
        {isAdmin && (
          <>
            <Link
              href="/settings/usuarios"
              onClick={onCloseMobile}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                inSettings ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              <Settings size={16} />
              Configuración
            </Link>

            {inSettings && (
              <div className="pl-4 space-y-0.5">
                {SETTINGS_NAV.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={onCloseMobile}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      pathname.startsWith(href) ? 'text-white bg-slate-700' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    )}
                  >
                    <Icon size={13} />
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        <PushSubscription />

        {/* Current user */}
        <div className="flex items-center gap-3 px-3 py-2 mt-1">
          {me?.avatar_url ? (
            <img src={me.avatar_url} alt={me.full_name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {me ? avatarInitials(me.full_name) : 'A'}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-white text-xs font-medium truncate">{me?.full_name ?? 'Cargando...'}</p>
            <p className="text-slate-500 text-[10px] truncate capitalize">{me?.role ?? ''}</p>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Sidebar ───────────────────────────────────────────────
export function Sidebar() {
  const pathname     = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const inSettings   = pathname.startsWith('/settings')

  const { data: meData } = useQuery<{ data: { full_name: string; avatar_url: string | null; role: string; email: string } }>({
    queryKey: ['auth-me'],
    queryFn:  () => fetch('/api/auth/me').then(r => r.json()),
    staleTime: 300_000,
  })
  const me      = meData?.data ?? null
  const isAdmin = FULL_ACCESS_ROLES.includes(me?.role ?? '')

  const { data: waData } = useQuery<{ data: WhatsAppConversation[] }>({
    queryKey: ['whatsapp-conversations'],
    queryFn:  () => fetch('/api/whatsapp/conversations').then(r => r.json()),
    refetchInterval: 60_000,
    staleTime: 30_000,
    enabled: isAdmin,
  })
  const totalUnread = (waData?.data ?? []).reduce((sum, c) => sum + c.unread_count, 0)

  const nav = isAdmin ? FULL_NAV : VIEWER_NAV

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
      >
        <Menu size={20} />
      </button>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={cn(
        'fixed md:static inset-y-0 left-0 z-50 md:z-auto w-60 flex-shrink-0 flex flex-col h-full transform transition-transform duration-200 ease-in-out',
        'md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )} style={{ background: 'var(--sidebar-bg)' }}>
        <NavContent
          pathname={pathname}
          nav={nav}
          inSettings={inSettings}
          isAdmin={isAdmin}
          totalUnread={totalUnread}
          me={me}
          onCloseMobile={() => setMobileOpen(false)}
        />
      </aside>
    </>
  )
}
