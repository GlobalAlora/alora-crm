'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Send, Users, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import Link from 'next/link'
import type { Campaign, CampaignRecipient } from '@/types'

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pendiente', cls: 'bg-slate-100 text-slate-600' },
    sent:    { label: 'Enviado',   cls: 'bg-emerald-100 text-emerald-700' },
    failed:  { label: 'Error',     cls: 'bg-red-100 text-red-700' },
  }
  const s = map[status] ?? map.pending
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)

  const { data: campaignData, isLoading } = useQuery<{ data: Campaign }>({
    queryKey: ['campaign', id],
    queryFn: () => fetch(`/api/campaigns/${id}`).then(r => r.json()),
    refetchInterval: (q) => q.state.data?.data?.status === 'sending' ? 3000 : false,
  })

  const { data: recipientsData } = useQuery<{ data: CampaignRecipient[] }>({
    queryKey: ['campaign-recipients', id],
    queryFn: () => fetch(`/api/campaigns/${id}/recipients`).then(r => r.json()),
    enabled: campaignData?.data?.status !== 'draft',
    refetchInterval: campaignData?.data?.status === 'sending' ? 3000 : false,
  })

  const campaign = campaignData?.data
  const recipients = recipientsData?.data ?? []

  const previewSegment = async () => {
    setPreviewing(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/preview`)
      const json = await res.json()
      setPreviewCount(json.count ?? 0)
    } catch {
      toast.error('Error al calcular segmento')
    } finally {
      setPreviewing(false)
    }
  }

  const sendMutation = useMutation({
    mutationFn: () => fetch(`/api/campaigns/${id}/send`, { method: 'POST' }).then(r => r.json()),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return }
      toast.success(res.message ?? 'Enviando campaña...')
      setConfirmSend(false)
      queryClient.invalidateQueries({ queryKey: ['campaign', id] })
      queryClient.invalidateQueries({ queryKey: ['campaign-recipients', id] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
    onError: () => toast.error('Error al enviar'),
  })

  if (isLoading || !campaign) {
    return <div className="p-6 text-slate-400 text-sm">Cargando campaña...</div>
  }

  const isSent = campaign.status === 'sent'
  const isSending = campaign.status === 'sending'
  const isDraft = campaign.status === 'draft'

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/email" className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-slate-900">{campaign.name}</h1>
          <p className="text-sm text-slate-500">{campaign.subject}</p>
        </div>
        {isDraft && (
          <div className="flex items-center gap-2">
            <button
              onClick={previewSegment}
              disabled={previewing}
              className="flex items-center gap-1.5 text-sm border px-3 py-2 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              <Users size={14} /> {previewing ? '...' : 'Ver destinatarios'}
            </button>
            <button
              onClick={() => { previewSegment(); setConfirmSend(true) }}
              className="flex items-center gap-1.5 bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Send size={14} /> Enviar campaña
            </button>
          </div>
        )}
        {isSending && (
          <span className="flex items-center gap-1.5 text-amber-700 text-sm bg-amber-50 px-3 py-1.5 rounded-lg">
            <Clock size={14} /> Enviando...
          </span>
        )}
      </div>

      {/* Stats */}
      {!isDraft && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{campaign.total_sent}</p>
            <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1"><CheckCircle size={11} /> Enviados</p>
          </div>
          <div className="bg-white border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{campaign.total_failed}</p>
            <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1"><XCircle size={11} /> Fallidos</p>
          </div>
          <div className="bg-white border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-slate-700">{campaign.total_sent + campaign.total_failed}</p>
            <p className="text-xs text-slate-500 mt-1">Total destinatarios</p>
          </div>
        </div>
      )}

      {/* Preview count (draft) */}
      {isDraft && previewCount !== null && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
          <Users size={16} className="text-blue-600" />
          <p className="text-sm text-blue-800">
            Esta campaña llegará a <strong>{previewCount}</strong> leads con email
          </p>
        </div>
      )}

      {/* Confirm send dialog */}
      {confirmSend && previewCount !== null && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle size={16} />
            <p className="text-sm font-medium">Confirmar envío masivo</p>
          </div>
          <p className="text-sm text-amber-700">
            Se enviará el email a <strong>{previewCount} destinatarios</strong>. Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {sendMutation.isPending ? 'Iniciando...' : `Confirmar — enviar a ${previewCount} leads`}
            </button>
            <button onClick={() => setConfirmSend(false)} className="text-sm text-slate-500 px-4 py-2 rounded-lg hover:bg-slate-100">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Email preview */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="border-b px-4 py-3 bg-slate-50">
          <p className="text-xs text-slate-500">Vista previa del email</p>
          <p className="text-sm font-medium text-slate-800 mt-0.5">{campaign.subject}</p>
          <p className="text-xs text-slate-400">De: {campaign.from_name} &lt;{campaign.from_email}&gt;</p>
        </div>
        <div
          className="p-5 text-sm text-slate-800 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: campaign.body }}
        />
      </div>

      {/* Recipients table */}
      {recipients.length > 0 && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="border-b px-4 py-3 bg-slate-50">
            <p className="text-sm font-medium text-slate-700">Destinatarios ({recipients.length})</p>
          </div>
          <div className="divide-y max-h-80 overflow-y-auto">
            {recipients.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800">
                    {r.lead ? [r.lead.nombre, r.lead.apellido].filter(Boolean).join(' ') : '—'}
                  </p>
                  <p className="text-xs text-slate-400">{r.email}</p>
                  {r.error && <p className="text-xs text-red-500 truncate">{r.error}</p>}
                </div>
                <StatusChip status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
