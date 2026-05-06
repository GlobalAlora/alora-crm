'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { timeAgoWithFullDate } from '@/lib/utils'

interface NotifActivity {
  id: string
  lead_id: string
  descripcion: string
  metadata: Record<string, unknown> | null
  created_at: string
  leads: { id: string; nombre: string; apellido: string | null; empresa: string | null } | null
}

function playNotifSound() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // AudioContext not available
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function getLeadName(n: NotifActivity): string {
  if (!n.leads) return 'Lead desconocido'
  return [n.leads.nombre, n.leads.apellido].filter(Boolean).join(' ')
}

export function NotificationBell() {
  const router = useRouter()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef<number | null>(null)

  const { data } = useQuery<{ data: NotifActivity[] }>({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/notifications').then(r => r.json()),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const notifications = data?.data ?? []
  const unread = notifications.length

  // Realtime subscription for new inbound emails
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('global-inbound-emails')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activities' },
        (payload) => {
          const meta = (payload.new as { metadata?: Record<string, unknown> }).metadata
          if (meta?.direction === 'inbound') {
            qc.invalidateQueries({ queryKey: ['notifications'] })
            if (soundEnabled) playNotifSound()
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [qc, soundEnabled])

  // Show browser notification badge when count increases
  useEffect(() => {
    if (prevCountRef.current !== null && unread > prevCountRef.current) {
      // New email arrived and dropdown isn't open
      if (!open) {
        document.title = `(${unread}) CRM · Alora`
      }
    } else if (unread === 0) {
      document.title = 'CRM · Alora'
    }
    prevCountRef.current = unread
  }, [unread, open])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markAllRead = useCallback(async () => {
    await fetch('/api/activities/read-inbound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    qc.invalidateQueries({ queryKey: ['notifications'] })
    document.title = 'CRM · Alora'
  }, [qc])

  const markOneRead = useCallback(async (id: string) => {
    await fetch(`/api/activities/${id}/read`, { method: 'PATCH' })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }, [qc])

  const handleClickNotif = async (n: NotifActivity) => {
    await markOneRead(n.id)
    setOpen(false)
    router.push(`/leads?id=${n.lead_id}`)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'relative p-2 rounded-md transition-colors',
          open ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
        )}
        title="Notificaciones"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold text-slate-800">
              Emails no leídos {unread > 0 && <span className="text-red-500">({unread})</span>}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSoundEnabled(v => !v)}
                className={cn('text-xs px-2 py-0.5 rounded transition-colors', soundEnabled ? 'text-blue-600 bg-blue-50' : 'text-slate-400 bg-slate-100')}
                title={soundEnabled ? 'Silenciar' : 'Activar sonido'}
              >
                {soundEnabled ? '🔔' : '🔕'}
              </button>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                  Marcar todos
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <Bell size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sin notificaciones</p>
              </div>
            ) : (
              notifications.map((n) => {
                const subject = (n.metadata?.subject as string | undefined) ?? '(sin asunto)'
                const fromName = (n.metadata?.from_name as string | undefined) ?? getLeadName(n)
                const preview = stripHtml(n.descripcion).replace(/✉ Respuesta de .+?Asunto: .+?/g, '').trim()

                return (
                  <button
                    key={n.id}
                    onClick={() => handleClickNotif(n)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{fromName}</p>
                        <p className="text-xs text-slate-600 truncate mt-0.5">{subject}</p>
                        {preview && (
                          <p className="text-xs text-slate-400 truncate mt-0.5">{preview.slice(0, 80)}</p>
                        )}
                        <p className="text-[10px] text-slate-300 mt-1">{timeAgoWithFullDate(n.created_at)}</p>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1" />
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
