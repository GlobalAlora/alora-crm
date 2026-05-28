'use client'

import { Plus, LogOut } from 'lucide-react'
import { useLeadFormStore } from '@/hooks/useLeadFormStore'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { GlobalLeadSearch } from '@/components/shared/GlobalLeadSearch'
import { NotificationBell } from '@/components/layout/NotificationBell'

export function Header() {
  const open = useLeadFormStore((s) => s.open)
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-14 flex items-center justify-between pl-14 pr-3 md:px-6 border-b bg-white flex-shrink-0 gap-2">
      <GlobalLeadSearch />
      <div className="flex items-center gap-2 flex-shrink-0">
        <NotificationBell />
        <button
          onClick={() => open()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 md:px-4 rounded-md transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Nuevo Lead</span>
        </button>
        <button
          onClick={handleLogout}
          className="p-2 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors hidden md:flex"
          title="Cerrar sesión"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
