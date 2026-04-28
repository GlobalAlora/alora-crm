'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ChevronDown } from 'lucide-react'
import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import type { Lead, PipelineStage } from '@/types'
import { PIPELINE_STAGES, PIPELINE_STAGE_MAP } from '@/types'
import { leadsApi } from '@/lib/api'
import { formatUSD, timeAgo } from '@/lib/utils'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { ActivityFeed } from './ActivityFeed'
import { TaskList } from './TaskList'

interface LeadDetailProps {
  lead: Lead
  onClose: () => void
  onStageChange: (lead: Lead) => void
  fullPage?: boolean
}

export function LeadDetail({ lead, onClose, onStageChange, fullPage = false }: LeadDetailProps) {
  const queryClient = useQueryClient()
  const [showStageMenu, setShowStageMenu] = useState(false)

  // Always fetch fresh detail
  const { data: freshLead } = useQuery({
    queryKey: ['lead', lead.id],
    queryFn: () => leadsApi.get(lead.id),
    staleTime: 0,
    initialData: lead,
  })

  const displayLead = freshLead ?? lead

  const stageMutation = useMutation({
    mutationFn: (stage: PipelineStage) => leadsApi.moveStage(lead.id, stage),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['lead', lead.id] })
      queryClient.invalidateQueries({ queryKey: ['activities', lead.id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      onStageChange(updated)
      setShowStageMenu(false)
      toast.success('Etapa actualizada')
    },
    onError: () => toast.error('Error al cambiar la etapa'),
  })

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const panelContent = (
    <div className={fullPage ? 'flex w-full h-full' : 'flex w-full max-w-3xl shadow-2xl'}>
        {/* Left panel — Lead info */}
        <div className="w-80 flex-shrink-0 bg-white border-r flex flex-col">
          <div className="flex items-start justify-between p-4 border-b">
            <div className="min-w-0">
              {displayLead.empresa && (
                <p className="text-xs text-slate-500 truncate">{displayLead.empresa}</p>
              )}
              <h2 className="font-semibold text-slate-900 truncate">{displayLead.nombre}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex-shrink-0 ml-2"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Quick actions */}
            <div className="p-4 border-b space-y-2">
              <div className="relative">
                <button
                  onClick={() => setShowStageMenu(!showStageMenu)}
                  className="w-full flex items-center justify-between text-sm border rounded-md px-3 py-2 hover:bg-slate-50 transition-colors"
                >
                  <StatusBadge stage={displayLead.estado_pipeline} />
                  <ChevronDown size={14} className="text-slate-400" />
                </button>

                {showStageMenu && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                    {PIPELINE_STAGES.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => stageMutation.mutate(s.value)}
                        disabled={s.value === displayLead.estado_pipeline || stageMutation.isPending}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40 transition-colors"
                      >
                        <StatusBadge stage={s.value} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Lead data */}
            <div className="p-4 space-y-3 border-b">
              <Section label="Contacto">
                <Field label="Email" value={displayLead.email} />
                <Field label="Teléfono" value={displayLead.telefono} />
                <Field label="País" value={displayLead.pais} />
              </Section>

              <Section label="Negocio">
                <Field label="Servicio" value={displayLead.servicio_interesado} />
                <Field label="Presupuesto" value={displayLead.presupuesto_estimado ? `~${formatUSD(displayLead.presupuesto_estimado)}` : null} />
                <Field label="Propuesta" value={displayLead.valor_propuesta_usd ? formatUSD(displayLead.valor_propuesta_usd) : null} />
                <Field label="Calidad" value={displayLead.calidad_lead} />
                <Field label="Fuente" value={displayLead.fuente} />
              </Section>

              <Section label="Fechas">
                <Field label="Ingresó" value={displayLead.fecha_ingreso ? timeAgo(displayLead.fecha_ingreso) : null} />
                <Field label="Contactado" value={displayLead.fecha_contacto ? timeAgo(displayLead.fecha_contacto) : null} />
                <Field label="Reunión" value={displayLead.fecha_reunion ? timeAgo(displayLead.fecha_reunion) : null} />
              </Section>

              {displayLead.responsable && (
                <Section label="Responsable">
                  <div className="flex items-center gap-2">
                    <UserAvatar
                      name={displayLead.responsable.full_name}
                      avatarUrl={displayLead.responsable.avatar_url}
                      size="sm"
                    />
                    <span className="text-sm text-slate-700">{displayLead.responsable.full_name}</span>
                  </div>
                </Section>
              )}

              {displayLead.notas && (
                <Section label="Notas">
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{displayLead.notas}</p>
                </Section>
              )}
            </div>

            {/* Tasks */}
            <TaskList leadId={lead.id} />
          </div>
        </div>

        {/* Right panel — Activity */}
        <div className="flex-1 bg-white flex flex-col min-w-0">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-semibold text-slate-700">Actividad</h3>
          </div>
          <div className="flex-1 overflow-hidden">
            <ActivityFeed leadId={lead.id} />
          </div>
        </div>
      </div>
  )

  if (fullPage) return panelContent

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl">
        {panelContent}
      </div>
    </>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex justify-between gap-2">
      <span className="text-xs text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-700 text-right truncate">{String(value)}</span>
    </div>
  )
}
