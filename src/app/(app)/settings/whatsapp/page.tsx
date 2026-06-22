'use client'

import { useQuery } from '@tanstack/react-query'
import {
  Smartphone,
  Wifi,
  WifiOff,
  Loader2,
  MessageCircle,
  Clock,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WhatsAppStatus {
  messages_last_24h: number
  total_conversations: number
  open_conversations: number
}

interface QrResponse {
  status: 'connected' | 'connecting' | 'disconnected' | 'not_configured' | 'error'
  qr: string | null
  error?: string
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: React.ElementType; color: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 flex items-center gap-4">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
        <Icon size={18} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

const STATUS_LABEL: Record<QrResponse['status'], string> = {
  connected:       'Conectado',
  connecting:      'Conectando…',
  disconnected:    'Desconectado',
  not_configured:  'Worker no configurado',
  error:           'Error de conexión',
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WhatsAppSettingsPage() {
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn:  () => fetch('/api/whatsapp/status').then(r => r.json()) as Promise<{ status: WhatsAppStatus }>,
    staleTime: 30_000,
    refetchInterval: 60_000,
    select: d => d.status,
  })

  // Poll the worker's connection state. While not connected, this also pulls a
  // fresh QR (Baileys rotates it periodically until someone scans it).
  const { data: qrData, isLoading: qrLoading } = useQuery({
    queryKey: ['whatsapp-qr'],
    queryFn:  () => fetch('/api/whatsapp/qr').then(r => r.json()) as Promise<QrResponse>,
    refetchInterval: (query) => query.state.data?.status === 'connected' ? 30_000 : 4_000,
  })

  const status = statusData
  const connStatus = qrData?.status ?? 'disconnected'
  const isConnected = connStatus === 'connected'

  return (
    <div className="max-w-3xl space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Smartphone size={22} className="text-green-500" />
            WhatsApp
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Vinculá el WhatsApp Business de Alora para recibir y enviar mensajes desde el CRM.
          </p>
        </div>

        {!qrLoading && (
          <div className={cn(
            'flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full',
            isConnected ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
          )}>
            {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {STATUS_LABEL[connStatus]}
          </div>
        )}
      </div>

      {/* Stats row */}
      {!statusLoading && status && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Mensajes hoy" value={status.messages_last_24h} icon={MessageCircle} color="bg-green-500" />
          <StatCard label="Conversaciones" value={status.total_conversations} icon={TrendingUp} color="bg-blue-500" />
          <StatCard label="Abiertas" value={status.open_conversations} icon={Clock} color="bg-orange-500" />
        </div>
      )}

      {/* Connection card */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Conexión (Baileys)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            El WhatsApp se conecta vía un proceso aparte (worker) que mantiene la sesión, igual que WhatsApp Web.
          </p>
        </div>

        <div className="px-6 py-8 flex flex-col items-center text-center gap-4">
          {connStatus === 'not_configured' && (
            <p className="text-sm text-slate-500 max-w-sm">
              Todavía no configuraste <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">BAILEYS_WORKER_URL</code> y{' '}
              <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">BAILEYS_WORKER_SECRET</code> en las variables de entorno del CRM.
            </p>
          )}

          {connStatus === 'error' && (
            <p className="text-sm text-red-600 max-w-sm">
              No se pudo contactar al worker{qrData?.error ? `: ${qrData.error}` : '.'}
            </p>
          )}

          {isConnected && (
            <>
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                <Wifi size={28} className="text-green-600" />
              </div>
              <p className="text-sm text-slate-600">WhatsApp conectado y listo para recibir mensajes.</p>
            </>
          )}

          {!isConnected && connStatus !== 'not_configured' && connStatus !== 'error' && (
            qrData?.qr ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrData.qr} alt="Escaneá este QR con WhatsApp" className="w-56 h-56 rounded-lg border border-slate-200" />
                <p className="text-sm text-slate-500 max-w-sm">
                  Abrí WhatsApp en el celular del número de Alora → <strong>Configuración → Dispositivos vinculados → Vincular un dispositivo</strong> y escaneá este código.
                </p>
              </>
            ) : (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 size={16} className="animate-spin" />
                Generando QR…
              </div>
            )
          )}
        </div>
      </section>

      {/* Future channels placeholder */}
      <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
        <p className="text-sm font-medium text-slate-500">Próximamente</p>
        <p className="text-xs text-slate-400 mt-1">Instagram DM · WhatsApp Business (canal 2) · SMS</p>
      </section>

    </div>
  )
}
