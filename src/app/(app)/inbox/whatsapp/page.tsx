'use client'

import { useState, useEffect, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { ConversationList } from '@/components/whatsapp/ConversationList'
import { ChatView } from '@/components/whatsapp/ChatView'
import type { WhatsAppConversation } from '@/types'

function WhatsAppInboxContent() {
  const searchParams = useSearchParams()
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)

  // Handle phone parameter from URL for new conversations
  useEffect(() => {
    const phoneParam = searchParams.get('phone')
    if (phoneParam) {
      setSelectedPhone(phoneParam)
      // Clear the parameter from URL
      window.history.replaceState({}, '', '/inbox/whatsapp')
    }
  }, [searchParams])

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

export default function WhatsAppInboxPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="text-slate-400">Cargando...</div>
      </div>
    }>
      <WhatsAppInboxContent />
    </Suspense>
  )
}

function EmptyState() {
  const [showNewChat, setShowNewChat] = useState(false)
  const [phone, setPhone] = useState('')

  const handleCreateChat = () => {
    if (phone.trim()) {
      // Normalize phone number (remove + if present)
      const normalizedPhone = phone.replace(/^\+/, '').trim()
      window.location.href = `/inbox/whatsapp?phone=${normalizedPhone}`
    }
  }

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
      
      {!showNewChat ? (
        <>
          <button
            onClick={() => setShowNewChat(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
          >
            Nueva Conversación
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-white border border-slate-200 rounded-lg px-4 py-2.5">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Los mensajes nuevos aparecen en tiempo real
          </div>
        </>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-4 w-full max-w-sm">
          <h4 className="font-medium text-slate-700 mb-3">Nueva Conversación</h4>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Número de teléfono (ej: 5491112345678)"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateChat}
              disabled={!phone.trim()}
              className="flex-1 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Iniciar Chat
            </button>
            <button
              onClick={() => setShowNewChat(false)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
