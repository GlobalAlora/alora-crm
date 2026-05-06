'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Send, Users, CheckCircle, XCircle, Clock, AlertTriangle, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react'
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

interface LeadOption {
  id: string
  nombre: string
  apellido: string | null
  email: string | null
  empresa: string | null
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)

  // Test send state
  const [showTestSend, setShowTestSend] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [leadSearch, setLeadSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null)
  const [sendingTest, setSendingTest] = useState(false)

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

  // Lead search for test send
  const { data: leadSearchData } = useQuery<{ data: LeadOption[] }>({
    queryKey: ['leads-search', leadSearch],
    queryFn: () => fetch(`/api/leads?buscar=${encodeURIComponent(leadSearch)}&limit=8`).then(r => r.json()),
    enabled: leadSearch.length >= 2,
  })

  const campaign = campaignData?.data
  const recipients = recipientsData?.data ?? []
  const leadOptions = leadSearchData?.data ?? []

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

  const handleTestSend = async () => {
    if (!testEmail) { toast.error('Ingresá un email de destino'); return }
    setSendingTest(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, leadId: selectedLead?.id }),
      })
      const json = await res.json()
      if (json.error) {
        toast.error(json.error)
      } else {
        toast.success(json.message ?? `Email de prueba enviado a ${testEmail}`)
        setTestEmail('')
        setSelectedLead(null)
        setLeadSearch('')
        setShowTestSend(false)
      }
    } catch {
      toast.error('Error al enviar el email de prueba')
    } finally {
      setSendingTest(false)
    }
  }

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

      {/* Test send section */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowTestSend(!showTestSend)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <span className="flex items-center gap-2 font-medium">
            <FlaskConical size={14} className="text-violet-500" />
            Enviar email de prueba
          </span>
          {showTestSend ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </button>

        {showTestSend && (
          <div className="border-t px-4 py-4 space-y-4">
            {/* Destination email */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email de destino *</label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>

            {/* Lead picker for variable substitution */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Usar datos de un lead para variables{' '}
                <span className="text-slate-400 font-normal">(opcional — si no, se usan datos de ejemplo)</span>
              </label>

              {selectedLead ? (
                <div className="flex items-center justify-between bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-violet-800">
                      {[selectedLead.nombre, selectedLead.apellido].filter(Boolean).join(' ')}
                    </p>
                    <p className="text-xs text-violet-500">{selectedLead.empresa ?? selectedLead.email ?? '—'}</p>
                  </div>
                  <button
                    onClick={() => { setSelectedLead(null); setLeadSearch('') }}
                    className="text-xs text-violet-500 hover:text-violet-800"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    placeholder="Buscar lead por nombre o empresa..."
                    className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  {leadOptions.length > 0 && leadSearch.length >= 2 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {leadOptions.map((lead) => (
                        <button
                          key={lead.id}
                          onClick={() => {
                            setSelectedLead(lead)
                            setLeadSearch('')
                            // Auto-fill email if empty
                            if (!testEmail && lead.email) setTestEmail(lead.email)
                          }}
                          className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors border-b last:border-b-0"
                        >
                          <p className="text-sm font-medium text-slate-800">
                            {[lead.nombre, lead.apellido].filter(Boolean).join(' ')}
                          </p>
                          <p className="text-xs text-slate-400">{lead.empresa ?? lead.email ?? '—'}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-slate-400 mt-1.5">
                Variables disponibles: <code className="bg-slate-100 px-1 rounded">{'{{nombre}}'}</code>{' '}
                <code className="bg-slate-100 px-1 rounded">{'{{empresa}}'}</code>{' '}
                <code className="bg-slate-100 px-1 rounded">{'{{email}}'}</code>
              </p>
            </div>

            <button
              onClick={handleTestSend}
              disabled={sendingTest || !testEmail}
              className="flex items-center gap-2 bg-violet-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              <FlaskConical size={13} />
              {sendingTest ? 'Enviando...' : 'Enviar prueba'}
            </button>
          </div>
        )}
      </div>

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
