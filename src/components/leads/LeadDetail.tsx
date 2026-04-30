'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Mail, Building2, Tag as TagIcon, Globe,
  MessageSquare, CheckSquare, FileText, History, ExternalLink,
  Check, AlertCircle, MessageCircle, ChevronDown,
} from 'lucide-react'
import { leadsApi } from '@/lib/api'
import { cn, formatUSD, formatARS, timeAgo } from '@/lib/utils'
import { PIPELINE_STAGES, FUENTES, PAISES, PIPELINE_STAGE_MAP } from '@/types'
import type { Lead, PipelineStage } from '@/types'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserAvatar } from '@/components/shared/UserAvatar'
import { ActivityFeed } from './ActivityFeed'
import { TaskList } from './TaskList'
import { PropuestasSection } from './PropuestasSection'
import { TagsSection } from './TagsSection'
import { StageHistorySection } from './StageHistorySection'
import { ServiciosEdit } from './ServiciosEdit'
import { FormDataSection } from './FormDataSection'
import toast from 'react-hot-toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeadDetailProps {
  lead: Lead
  onClose: () => void
  onStageChange?: (lead: Lead) => void
  fullPage?: boolean
}

type Tab = 'actividad' | 'tareas' | 'propuestas' | 'tags' | 'historial' | 'formulario'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'actividad',   label: 'Actividad',   icon: MessageSquare },
  { id: 'tareas',      label: 'Tareas',       icon: CheckSquare   },
  { id: 'propuestas',  label: 'Propuestas',   icon: FileText      },
  { id: 'tags',        label: 'Etiquetas',    icon: TagIcon       },
  { id: 'historial',   label: 'Historial',    icon: History       },
  { id: 'formulario',  label: 'Formulario',   icon: Globe         },
]

// ── Inline editable field ─────────────────────────────────────────────────────

function EditableField({
  label, value, onSave, type = 'text', placeholder = '—',
}: {
  label: string
  value: string
  onSave: (v: string) => void
  type?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const save = () => {
    onSave(draft)
    setEditing(false)
  }

  return (
    <div className="group">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      {editing ? (
        <div className="flex gap-1 items-center">
          <input
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className="flex-1 text-sm border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') { setDraft(value); setEditing(false) }
            }}
          />
          <button onClick={save} className="p-1 text-green-600 hover:bg-green-50 rounded">
            <Check size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setDraft(value); setEditing(true) }}
          className="w-full text-left text-sm text-slate-800 hover:text-blue-600 group-hover:underline decoration-dashed underline-offset-2 transition-colors truncate"
        >
          {value || <span className="text-slate-300">{placeholder}</span>}
        </button>
      )}
    </div>
  )
}

// ── Stage selector ────────────────────────────────────────────────────────────

function StageSelector({ lead, onStageChange }: { lead: Lead; onStageChange?: (l: Lead) => void }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const stageMutation = useMutation({
    mutationFn: (stage: PipelineStage) => leadsApi.moveStage(lead.id, stage),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead', lead.id] })
      onStageChange?.(updated)
      toast.success('Estado actualizado')
    },
    onError: () => toast.error('Error al cambiar estado'),
  })

  const stageCfg = PIPELINE_STAGE_MAP[lead.estado_pipeline]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors bg-white"
      >
        <StatusBadge stage={lead.estado_pipeline} />
        <ChevronDown size={13} className="text-slate-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-52 max-h-64 overflow-y-auto">
            {PIPELINE_STAGES.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  stageMutation.mutate(s.value)
                  setOpen(false)
                }}
                className={cn(
                  'w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-50',
                  lead.estado_pipeline === s.value && 'font-semibold'
                )}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-2"
                  style={{ background: s.color }}
                />
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function LeadDetail({ lead, onClose, onStageChange, fullPage }: LeadDetailProps) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('actividad')
  const [servicios, setServicios] = useState<string[]>(lead.servicios_interesados ?? [])

  const patchMutation = useMutation({
    mutationFn: (data: Partial<Lead>) => leadsApi.update(lead.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['lead', lead.id] })
      toast.success('Guardado')
    },
    onError: () => toast.error('Error al guardar'),
  })

  const patch = (data: Partial<Lead>) => patchMutation.mutate(data)

  const deleteMutation = useMutation({
    mutationFn: () => leadsApi.remove(lead.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      onClose()
      toast.success('Lead eliminado')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const handleServiciosChange = (s: string[]) => {
    setServicios(s)
    patch({ servicios_interesados: s, servicio_interesado: s[0] ?? null })
  }

  const valor = lead.valor_propuesta_usd
    ? formatUSD(lead.valor_propuesta_usd)
    : lead.valor_propuesta_ars
      ? formatARS(lead.valor_propuesta_ars)
      : null

  const whatsappUrl = lead.telefono
    ? `https://wa.me/${lead.telefono.replace(/\D/g, '')}`
    : null

  // ── Panel layout ──────────────────────────────────────────────────────────
  const wrapper = fullPage
    ? 'flex flex-col md:flex-row h-full overflow-hidden'
    : 'fixed inset-y-0 right-0 z-40 flex flex-col md:flex-row w-full md:w-[900px] shadow-2xl bg-white border-l border-slate-200'

  return (
    <>
      {/* Backdrop (only for slide-over) */}
      {!fullPage && (
        <div className="fixed inset-0 bg-black/30 z-30" onClick={onClose} />
      )}

      <div className={wrapper}>

        {/* ── Left panel: lead info ────────────────────────────────────────── */}
        <div className="w-full md:w-72 flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  {lead.nombre}{lead.apellido ? ` ${lead.apellido}` : ''}
                </h2>
                {lead.empresa && (
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <Building2 size={11} /> {lead.empresa}
                  </p>
                )}
              </div>
              {!fullPage && (
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors flex-shrink-0"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Stage selector */}
            <StageSelector lead={lead} onStageChange={onStageChange} />

            {/* Quick actions */}
            <div className="flex gap-2">
              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-white hover:border-slate-300 transition-colors"
                >
                  <Mail size={13} /> Email
                </a>
              )}
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-white hover:border-slate-300 transition-colors"
                >
                  <MessageCircle size={13} className="text-green-500" /> WhatsApp
                </a>
              )}
            </div>

            {/* Warnings */}
            {lead.dias_sin_respuesta != null && lead.dias_sin_respuesta > 3 && (
              <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                <AlertCircle size={13} />
                Sin respuesta hace {lead.dias_sin_respuesta} días
              </div>
            )}

            {/* Contact fields */}
            <div className="space-y-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Contacto</p>

              <EditableField
                label="Email"
                value={lead.email ?? ''}
                onSave={(v) => patch({ email: v || null })}
                type="email"
                placeholder="Sin email"
              />
              {lead.email_secundario && (
                <EditableField
                  label="Email secundario"
                  value={lead.email_secundario ?? ''}
                  onSave={(v) => patch({ email_secundario: v || null })}
                  type="email"
                />
              )}
              <EditableField
                label="Teléfono"
                value={lead.telefono ?? ''}
                onSave={(v) => patch({ telefono: v || null })}
                placeholder="Sin teléfono"
              />
              <EditableField
                label="Empresa"
                value={lead.empresa ?? ''}
                onSave={(v) => patch({ empresa: v || null })}
                placeholder="Sin empresa"
              />
              <EditableField
                label="Sitio web"
                value={lead.sitio_web ?? ''}
                onSave={(v) => patch({ sitio_web: v || null })}
                type="url"
                placeholder="Sin sitio web"
              />
              {lead.sitio_web && (
                <a
                  href={lead.sitio_web}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <ExternalLink size={11} /> Abrir sitio
                </a>
              )}

              {/* Country */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">País</p>
                <select
                  value={lead.pais ?? ''}
                  onChange={(e) => patch({ pais: e.target.value || null })}
                  className="text-sm text-slate-800 bg-transparent focus:outline-none cursor-pointer hover:text-blue-600 transition-colors w-full"
                >
                  <option value="">— Sin país —</option>
                  {PAISES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Business */}
            <div className="space-y-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Negocio</p>

              {/* Source */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Fuente</p>
                <select
                  value={lead.fuente ?? ''}
                  onChange={(e) => patch({ fuente: (e.target.value as Lead['fuente']) || null })}
                  className="text-sm text-slate-800 bg-transparent focus:outline-none cursor-pointer hover:text-blue-600 transition-colors w-full"
                >
                  <option value="">— Sin fuente —</option>
                  {FUENTES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>

              {valor && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Valor propuesta</p>
                  <p className="text-sm font-semibold text-slate-900">{valor}</p>
                </div>
              )}

              {/* Responsable */}
              {lead.responsable && (
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Responsable</p>
                  <UserAvatar user={lead.responsable} size="sm" showName />
                </div>
              )}
            </div>

            {/* Servicios */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Servicios de interés</p>
              <ServiciosEdit value={servicios} onChange={handleServiciosChange} />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Notas</p>
              <NoteEditor
                value={lead.notas ?? ''}
                onSave={(v) => patch({ notas: v || null })}
              />
            </div>

            {/* Meta */}
            <div className="space-y-1 pt-2 border-t border-slate-200">
              <p className="text-[10px] text-slate-400">Ingresó {timeAgo(lead.fecha_ingreso)}</p>
              {lead.last_activity_at && (
                <p className="text-[10px] text-slate-400">Últ. actividad {timeAgo(lead.last_activity_at)}</p>
              )}
            </div>

            {/* Delete */}
            <button
              onClick={() => {
                if (confirm('¿Eliminar este lead? Esta acción no se puede deshacer.')) {
                  deleteMutation.mutate()
                }
              }}
              className="w-full text-xs text-red-400 hover:text-red-600 py-2 border border-dashed border-red-200 rounded-lg hover:border-red-300 transition-colors"
            >
              Eliminar lead
            </button>
          </div>
        </div>

        {/* ── Right panel: tabs ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Tab bar */}
          <div className="flex items-center gap-0 border-b border-slate-200 px-4 overflow-x-auto flex-shrink-0">
            {TABS.filter((t) => t.id !== 'formulario' || !!lead.form_data).map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                    tab === t.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  )}
                >
                  <Icon size={14} />
                  {t.label}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-5">
            {tab === 'actividad'  && <ActivityFeed leadId={lead.id} />}
            {tab === 'tareas'     && <TaskList leadId={lead.id} />}
            {tab === 'propuestas' && <PropuestasSection leadId={lead.id} propuestas={lead.propuestas} />}
            {tab === 'tags'       && <TagsSection leadId={lead.id} />}
            {tab === 'historial'  && <StageHistorySection history={lead.stage_history} />}
            {tab === 'formulario' && <FormDataSection formData={lead.form_data} />}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Note inline editor ────────────────────────────────────────────────────────

function NoteEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          autoFocus
          className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => { setDraft(value); setEditing(false) }}
            className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700"
          >
            Cancelar
          </button>
          <button
            onClick={() => { onSave(draft); setEditing(false) }}
            className="text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Guardar
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true) }}
      className="w-full text-left text-sm text-slate-600 hover:text-blue-600 whitespace-pre-wrap break-words transition-colors"
    >
      {value || <span className="text-slate-300 italic text-xs">Hacer clic para agregar notas...</span>}
    </button>
  )
}
