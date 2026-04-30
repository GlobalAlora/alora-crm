'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Smartphone,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Wifi,
  WifiOff,
  MessageCircle,
  Clock,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WhatsAppConfig {
  id: string | null
  channel_type: string
  label: string
  phone_number_id: string
  business_account_id: string
  access_token_masked: string
  has_token: boolean
  verify_token: string
  webhook_url: string
  is_active: boolean
  last_message_at: string | null
  last_error: string | null
  last_error_at: string | null
}

interface WhatsAppStatus {
  is_configured: boolean
  is_active: boolean
  last_message_at: string | null
  last_error: string | null
  last_error_at: string | null
  messages_last_24h: number
  total_conversations: number
  open_conversations: number
}

interface TestResult {
  success: boolean
  error?: string
  phone_number?: string
  verified_name?: string
  quality_rating?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null) {
  if (!iso) return null
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es })
  } catch {
    return null
  }
}

function qualityColor(rating: string | undefined) {
  if (!rating) return 'text-slate-400'
  if (rating === 'GREEN') return 'text-green-500'
  if (rating === 'YELLOW') return 'text-yellow-500'
  return 'text-red-500'
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WhatsAppSettingsPage() {
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  // Form state (loaded from config)
  const [phoneNumberId,     setPhoneNumberId]     = useState('')
  const [businessAccountId, setBusinessAccountId] = useState('')
  const [accessToken,       setAccessToken]       = useState('')
  const [verifyToken,       setVerifyToken]       = useState('')
  const [formDirty,         setFormDirty]         = useState(false)

  // ── Config query ─────────────────────────────────────────────────────────
  const { data: cfgData, isLoading: cfgLoading } = useQuery({
    queryKey: ['whatsapp-config'],
    queryFn:  () => fetch('/api/whatsapp/config').then(r => r.json()) as Promise<{ config: WhatsAppConfig }>,
    staleTime: 60_000,
    select: d => d.config,
  })

  // Initialise form when config loads (only once)
  const [initialised, setInitialised] = useState(false)
  if (cfgData && !initialised) {
    setPhoneNumberId(cfgData.phone_number_id ?? '')
    setBusinessAccountId(cfgData.business_account_id ?? '')
    setAccessToken(cfgData.access_token_masked ?? '')
    setVerifyToken(cfgData.verify_token ?? '')
    setInitialised(true)
  }

  // ── Status query ──────────────────────────────────────────────────────────
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn:  () => fetch('/api/whatsapp/status').then(r => r.json()) as Promise<{ status: WhatsAppStatus }>,
    staleTime: 30_000,
    refetchInterval: 60_000,
    select: d => d.status,
  })

  // ── Save config mutation ──────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => fetch('/api/whatsapp/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number_id: phoneNumberId, business_account_id: businessAccountId, access_token: accessToken, verify_token: verifyToken }),
    }).then(r => r.json()),
    onSuccess: () => {
      toast.success('Configuración guardada')
      setFormDirty(false)
      qc.invalidateQueries({ queryKey: ['whatsapp-config'] })
      qc.invalidateQueries({ queryKey: ['whatsapp-status'] })
    },
    onError: () => toast.error('Error al guardar'),
  })

  // ── Test connection mutation ───────────────────────────────────────────────
  const testMutation = useMutation({
    mutationFn: () => fetch('/api/whatsapp/test', { method: 'POST' }).then(r => r.json()) as Promise<TestResult>,
    onSuccess: (res) => {
      setTestResult(res)
      if (res.success) {
        toast.success('Conexión exitosa')
        refetchStatus()
      } else {
        toast.error(res.error ?? 'Error de conexión')
      }
    },
    onError: () => {
      toast.error('Error al probar conexión')
      setTestResult({ success: false, error: 'Error de red' })
    },
  })

  // ── Copy webhook URL ──────────────────────────────────────────────────────
  function copyWebhook() {
    if (!cfgData?.webhook_url) return
    navigator.clipboard.writeText(cfgData.webhook_url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function markDirty() {
    if (!formDirty) setFormDirty(true)
  }

  const status = statusData
  const isConfigured = status?.is_configured ?? false

  // ─────────────────────────────────────────────────────────────────────────
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
            Conectá tu cuenta de WhatsApp Business para recibir y enviar mensajes desde el CRM.
          </p>
        </div>

        {/* Connection status pill */}
        {!statusLoading && (
          <div className={cn(
            'flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full',
            isConfigured
              ? 'bg-green-50 text-green-700'
              : 'bg-slate-100 text-slate-500'
          )}>
            {isConfigured ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isConfigured ? 'Conectado' : 'Sin configurar'}
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

      {/* Last activity / error strip */}
      {status?.last_message_at && (
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
          Último mensaje recibido: <span className="font-medium text-slate-800">{timeAgo(status.last_message_at)}</span>
        </div>
      )}
      {status?.last_error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium">Último error:</span> {status.last_error}
            {status.last_error_at && (
              <span className="text-red-500 ml-1">({timeAgo(status.last_error_at)})</span>
            )}
          </div>
        </div>
      )}

      {/* Config form */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Credenciales de la API</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Encontrá estos valores en el{' '}
            <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              Meta Developer Portal
            </a>
            .
          </p>
        </div>

        <div className="px-6 py-6 space-y-5">

          {/* Phone Number ID */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Phone Number ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={phoneNumberId}
              onChange={e => { setPhoneNumberId(e.target.value); markDirty() }}
              placeholder="ej. 952294397974137"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          {/* Business Account ID */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Business Account ID
            </label>
            <input
              type="text"
              value={businessAccountId}
              onChange={e => { setBusinessAccountId(e.target.value); markDirty() }}
              placeholder="ej. 123456789012345"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          {/* Access Token */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Access Token <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={accessToken}
              onChange={e => { setAccessToken(e.target.value); markDirty() }}
              placeholder={cfgData?.has_token ? 'Dejar vacío para mantener el actual' : 'EAAXcp5K3…'}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono"
            />
            {cfgData?.has_token && (
              <p className="text-xs text-slate-400 mt-1">
                Token configurado: <span className="font-mono">{cfgData.access_token_masked}</span>. Escribí uno nuevo para reemplazarlo.
              </p>
            )}
          </div>

          {/* Verify Token */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Verify Token del Webhook
            </label>
            <input
              type="text"
              value={verifyToken}
              onChange={e => { setVerifyToken(e.target.value); markDirty() }}
              placeholder="alora-whatsapp-2026"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-400 mt-1">Debe coincidir exactamente con el valor configurado en el Meta Developer Portal.</p>
          </div>

          {/* Webhook URL (read-only) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              URL del Webhook <span className="text-slate-400 text-xs font-normal">(solo lectura)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={cfgData?.webhook_url ?? ''}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600 font-mono select-all cursor-text"
              />
              <button
                onClick={copyWebhook}
                className="flex-shrink-0 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                title="Copiar"
              >
                {copied ? <Check size={15} className="text-green-500" /> : <Copy size={15} className="text-slate-500" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">Configurá esta URL como webhook en el Meta Developer Portal.</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || cfgLoading}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
              'border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <RefreshCw size={14} className={testMutation.isPending ? 'animate-spin' : ''} />
            Probar conexión
          </button>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !formDirty}
            className={cn(
              'px-5 py-2 rounded-lg text-sm font-medium transition-colors',
              formDirty
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}
          >
            {saveMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </section>

      {/* Test result */}
      {testResult && (
        <div className={cn(
          'rounded-xl border px-5 py-4 flex items-start gap-3',
          testResult.success
            ? 'border-green-200 bg-green-50'
            : 'border-red-200 bg-red-50'
        )}>
          {testResult.success
            ? <CheckCircle2 size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
            : <XCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          }
          <div className="text-sm">
            {testResult.success ? (
              <>
                <p className="font-semibold text-green-800">Conexión exitosa</p>
                {testResult.verified_name && (
                  <p className="text-green-700 mt-0.5">Cuenta: <span className="font-medium">{testResult.verified_name}</span></p>
                )}
                {testResult.phone_number && (
                  <p className="text-green-700">Teléfono: <span className="font-medium">{testResult.phone_number}</span></p>
                )}
                {testResult.quality_rating && (
                  <p className="text-green-700">
                    Calidad:{' '}
                    <span className={cn('font-medium', qualityColor(testResult.quality_rating))}>
                      {testResult.quality_rating}
                    </span>
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="font-semibold text-red-800">Error de conexión</p>
                <p className="text-red-700 mt-0.5">{testResult.error}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Future channels placeholder */}
      <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
        <p className="text-sm font-medium text-slate-500">Próximamente</p>
        <p className="text-xs text-slate-400 mt-1">Instagram DM · WhatsApp Business (canal 2) · SMS</p>
      </section>

    </div>
  )
}
