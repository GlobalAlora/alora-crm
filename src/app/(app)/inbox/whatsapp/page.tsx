'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { ConversationList } from '@/components/whatsapp/ConversationList'
import { ChatView } from '@/components/whatsapp/ChatView'
import type { WhatsAppConversation } from '@/types'

export default function WhatsAppInboxPage() {
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)

  const { data } = useQuery<{ data: WhatsAppConversation[] }>({
    queryKey: ['whatsapp-conversations'],
    queryFn: () => fetch('/api/whatsapp/conversations').then(r => r.json()),
    staleTime: 30_000,
  })

  const conversations = data?.data ?? []
  const selectedConv = conversations.find(c => c.phone_number === selectedPhone)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: conversation list */}
      <ConversationList
        selectedPhone={selectedPhone}
        onSelect={setSelectedPhone}
      />

      {/* Right: chat or empty state */}
      {selectedPhone ? (
        <ChatView
          phone={selectedPhone}
          conversation={selectedConv}
          onClose={() => setSelectedPhone(null)}
        />
      ) : (
        <EmptyState />
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center">
        <MessageCircle size={28} className="text-green-600" />
      </div>
      <div className="text-center">
        <h3 className="text-base font-semibold text-slate-700">WhatsApp Inbox</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-xs">
          Seleccioná una conversación de la izquierda para ver los mensajes y responder.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-white border border-slate-200 rounded-lg px-4 py-2.5">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        Los mensajes nuevos aparecen en tiempo real
      </div>
    </div>
  )
}
