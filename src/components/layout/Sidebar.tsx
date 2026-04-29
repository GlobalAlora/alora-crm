'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Settings, FileCode2, CheckSquare, Mail, Tag, List } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    href: '/leads',
    label: 'Leads',
    icon: Users,
    sub: [
      { href: '/leads/tareas', label: 'Tareas', icon: CheckSquare },
    ],
  },
  { href: '/email', label: 'Email Marketing', icon: Mail },
]

const settingsNav = [
  { href: '/settings/forms', label: 'Formularios', icon: FileCode2 },
  { href: '/settings/tags', label: 'Etiquetas', icon: Tag },
  { href: '/settings/lists', label: 'Listas', icon: List },
]

export function Sidebar() {
  const pathname = usePathname()
  const inSettings = pathname.startsWith('/settings')
  const inLeads = pathname.startsWith('/leads')

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col h-full" style={{ background: 'var(--sidebar-bg)' }}>
      <div className="px-6 py-5 border-b border-slate-800">
        <span className="text-white font-semibold text-lg tracking-tight">Alora CRM</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon, sub }) => {
          const isParentActive = pathname.startsWith(href)

          return (
            <div key={href}>
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isParentActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                )}
              >
                <Icon size={16} />
                {label}
              </Link>

              {/* Sub-nav shown when parent is active */}
              {sub && isParentActive && (
                <div className="pl-4 mt-0.5 space-y-0.5">
                  {sub.map(({ href: subHref, label: subLabel, icon: SubIcon }) => (
                    <Link
                      key={subHref}
                      href={subHref}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                        pathname.startsWith(subHref)
                          ? 'text-white bg-slate-700'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      )}
                    >
                      <SubIcon size={13} />
                      {subLabel}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="px-3 pb-4 border-t border-slate-800 pt-4 space-y-1">
        {/* Settings link */}
        <Link
          href="/settings/forms"
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            inSettings
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          )}
        >
          <Settings size={16} />
          Configuración
        </Link>

        {/* Settings sub-nav */}
        {inSettings && (
          <div className="pl-4 space-y-0.5">
            {settingsNav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  pathname.startsWith(href)
                    ? 'text-white bg-slate-700'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                )}
              >
                <Icon size={13} />
                {label}
              </Link>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 px-3 py-2 mt-1">
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
            A
          </div>
          <span className="text-slate-400 text-sm truncate">Admin</span>
        </div>
      </div>
    </aside>
  )
}
