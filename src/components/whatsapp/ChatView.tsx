'use client'

import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Send, User, X, MessageCircle, Bot, MailOpen } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { MessageBubble, DateSeparator } from './MessageBubble'
import type { WhatsAppConversation, WhatsAppMessage } from '@/types'

interface Props {
  phone: string
  conversation: WhatsAppConversation | undefined
  onClose?: () => void
}

interface MessagesResponse {
  data: WhatsAppMessage[]
  conversation_id: string | null
}

export function ChatView({ phone, conversation, onClose }: Props) {
  const queryClient = useQueryClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const [text, setText] = useState('')

  // Fetch messages from wa_messages via conversation
  const { data, isLoading } = useQuery<MessagesResponse>({
    queryKey: ['whatsapp-messages', phone],
    queryFn: () =>
      fetch(`/api/whatsapp/conversations/${phone}`)
        .then(r => r.json()) as Promise<MessagesResponse>,
    enabled: !!phone,
  })

  const messages = data?.data ?? []
  const conversationId = data?.conversation_id ?? conversation?.id ?? null

  // Mark as read when conversation opens
  useEffect(() => {
    if (!phone || !conversation?.unread_count) return
    fetch(`/api/whatsapp/conversations/${phone}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unread_count: 0 }),
    }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] })
    }).catch(() => { /* noop */ })
  }, [phone, conversation?.unread_count, queryClient])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Realtime: new messages or status updates for this conversation
  useEffect(() => {
    if (!phone) return
    const supabase = createClient()

    const channel = supabase
      .channel(`wa-chat-${phone}`)
      // New inbound messages
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'wa_messages',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', phone] })
        queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] })
      })
      // Status updates (sent → delivered → read)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'wa_messages',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', phone] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [phone, queryClient])

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!conversationId) {
        // First message to this number — need to create conversation first via sending
        // The backend will handle it
      }
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          message,
          conversation_id: conversationId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Error al enviar')
      }
      return res.json()
    },
    onSuccess: () => {
      setText('')
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', phone] })
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const markUnreadMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/whatsapp/conversations/${phone}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unread_count: 1 }),
      }).then(r => { if (!r.ok) throw new Error('Error') }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] })
      onClose?.()
    },
  })

  // Toggle the qualifying/FAQ bot on or off for this conversation
  const toggleBotMutation = useMutation({
    mutationFn: async (botActive: boolean) => {
      const res = await fetch(`/api/whatsapp/conversations/${phone}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_active: botActive }),
      })
      if (!res.ok) throw new Error('Error al cambiar el estado de Lidia')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || sendMutation.isPending) return
    sendMutation.mutate(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const displayName = conversation?.lead
    ? [conversation.lead.nombre, conversation.lead.apellido].filter(Boolean).join(' ')
    : `+${phone}`

  // Group messages by date for separators
  const groupedMessages: { date: string; msgs: WhatsAppMessage[] }[] = []
  for (const msg of messages) {
    const dateKey = format(new Date(msg.created_at), 'yyyy-MM-dd')
    const last = groupedMessages[groupedMessages.length - 1]
    if (last && format(new Date(last.date), 'yyyy-MM-dd') === dateKey) {
      last.msgs.push(msg)
    } else {
      groupedMessages.push({ date: msg.created_at, msgs: [msg] })
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-w-0">
      {/* Chat Header */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 text-green-700 font-semibold text-sm">
          {conversation?.lead?.nombre
            ? conversation.lead.nombre[0].toUpperCase()
            : phone.slice(-2)}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 text-sm truncate">{displayName}</p>
          <p className="text-xs text-slate-400">+{phone}</p>
        </div>

        {conversation && (
          <button
            onClick={() => toggleBotMutation.mutate(!conversation.bot_active)}
            disabled={toggleBotMutation.isPending}
            title={conversation.bot_active ? 'Lidia está atendiendo esta conversación — click para pausarla' : 'Lidia está pausada — click para reactivarla'}
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50',
              conversation.bot_active
                ? 'text-green-700 bg-green-50 hover:bg-green-100'
                : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
            )}
          >
            <Bot size={12} />
            {conversation.bot_active ? 'Lidia activa' : 'Lidia pausada'}
          </button>
        )}

        {conversation && (
          <button
            onClick={() => markUnreadMutation.mutate()}
            disabled={markUnreadMutation.isPending}
            title="Marcar como no leído"
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <MailOpen size={12} />
            No leído
          </button>
        )}

        {conversation?.lead_id && (
          <Link
            href={`/leads/${conversation.lead_id}`}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 px-2.5 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
          >
            <User size={12} />
            Ver lead
          </Link>
        )}

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                <div className={cn(
                  'h-10 rounded-2xl animate-pulse',
                  i % 2 === 0 ? 'w-48 bg-slate-200' : 'w-36 bg-green-200'
                )} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <MessageCircle size={36} className="text-slate-300" />
            <div>
              <p className="text-sm font-medium text-slate-500">Sin mensajes aún</p>
              <p className="text-xs text-slate-400 mt-0.5">Escribí el primer mensaje abajo</p>
            </div>
          </div>
        ) : (
          <>
            {groupedMessages.map(({ date, msgs }) => (
              <div key={date}>
                <DateSeparator date={date} />
                {msgs.map(msg => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
              </div>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 bg-white border-t border-slate-200 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribí un mensaje... (Enter para enviar)"
            rows={1}
            className={cn(
              'flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent',
              'max-h-32 overflow-y-auto leading-relaxed'
            )}
            style={{ minHeight: '42px' }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 128) + 'px'
            }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
              text.trim() && !sendMutation.isPending
                ? 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}
          >
            {sendMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 ml-1">
          Shift+Enter para nueva línea
        </p>
      </div>
    </div>
  )
}
