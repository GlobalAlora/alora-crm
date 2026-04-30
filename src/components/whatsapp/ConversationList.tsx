'use client'

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { MessageCircle, Search } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { WhatsAppConversation } from '@/types'

interface Props {
  selectedPhone: string | null
  onSelect: (phone: string) => void
}

function displayName(conv: WhatsAppConversation): string {
  if (conv.lead?.nombre) {
    return [conv.lead.nombre, conv.lead.apellido].filter(Boolean).join(' ')
  }
  return `+${conv.phone_number}`
}

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { locale: es, addSuffix: false })
  } catch {
    return ''
  }
}

export function ConversationList({ selectedPhone, onSelect }: Props) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<{ data: WhatsAppConversation[] }>({
    queryKey: ['whatsapp-conversations'],
    queryFn: () => fetch('/api/whatsapp/conversations').then(r => r.json()),
    refetchInterval: 30_000,
  })

  // Realtime: refresh list when conversations change
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('wa-conv-list')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_conversations',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])

  const conversations = data?.data ?? []

  return (
    <div className="w-80 flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
            <MessageCircle size={16} className="text-white" />
          </div>
          <h2 className="font-semibold text-slate-900 text-sm">WhatsApp Inbox</h2>
          {conversations.some(c => c.unread_count > 0) && (
            <span className="ml-auto text-xs bg-green-500 text-white rounded-full px-1.5 py-0.5 font-medium">
              {conversations.reduce((sum, c) => sum + c.unread_count, 0)}
            </span>
          )}
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex gap-3 p-2 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 bg-slate-200 rounded w-3/4" />
                  <div className="h-2.5 bg-slate-100 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
            <MessageCircle size={32} className="text-slate-300" />
            <div>
              <p className="text-sm font-medium text-slate-500">Sin conversaciones</p>
              <p className="text-xs text-slate-400 mt-0.5">Los mensajes de WhatsApp aparecerán aquí</p>
            </div>
          </div>
        ) : (
          conversations.map(conv => (
            <button
              key={conv.phone_number}
              onClick={() => onSelect(conv.phone_number)}
              className={cn(
                'w-full flex gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 border-b border-slate-100',
                selectedPhone === conv.phone_number && 'bg-green-50 hover:bg-green-50 border-l-2 border-l-green-500'
              )}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-slate-600 font-semibold text-sm">
                {conv.lead?.nombre
                  ? conv.lead.nombre[0].toUpperCase()
                  : conv.phone_number.slice(-2)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className={cn(
                    'text-sm truncate',
                    conv.unread_count > 0 ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'
                  )}>
                    {displayName(conv)}
                  </span>
                  <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                    {timeAgo(conv.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className={cn(
                    'text-xs truncate',
                    conv.unread_count > 0 ? 'text-slate-700 font-medium' : 'text-slate-400'
                  )}>
                    {conv.last_message_text ?? 'Sin mensajes'}
                  </p>
                  {conv.unread_count > 0 && (
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-green-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {conv.unread_count > 9 ? '9+' : conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
