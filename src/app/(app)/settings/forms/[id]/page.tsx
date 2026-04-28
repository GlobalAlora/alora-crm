'use client'

import { useState, useEffect, use } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Copy, Check, ExternalLink,
  Users, TrendingUp, DollarSign, Zap, MousePointerClick, LogOut,
  Plus, Trash2, GripVertical,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formsApi } from '@/lib/api'
import type { FormDetail } from '@/lib/api'
import type { FormField } from '@/app/api/embed/config/route'
import { formatUSD } from '@/lib/utils'

const INPUT = 'w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow'

const FIELD_TYPES = ['text', 'email', 'phone', 'textarea', 'select'] as const

export default function FormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: form, isLoading } = useQuery({
    queryKey: ['form', id],
    queryFn: () => formsApi.get(id),
    staleTime: 30_000,
  })

  const [name, setName]       = useState('')
  const [title, setTitle]     = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [color, setColor]     = useState('#2563eb')
  const [fields, setFields]   = useState<FormField[]>([])
  const [tags, setTags]       = useState('')
  const [copied, setCopied]   = useState<'inline' | 'widget' | null>(null)
  const [activeTab, setActiveTab] = useState<'editor' | 'analytics' | 'snippet'>('editor')

  // Sync form data into local state
  useEffect(() => {
    if (!form) return
    setName(form.name)
    setTitle(form.title)
    setSubtitle(form.subtitle)
    setColor(form.color)
    setFields(form.fields ?? [])
    setTags((form.tags ?? []).join(', '))
  }, [form])

  const saveMutation = useMutation({
    mutationFn: () => formsApi.update(id, {
      name, title, subtitle, color,
      fields,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form', id] })
      queryClient.invalidateQueries({ queryKey: ['forms'] })
      toast.success('Formulario guardado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const copy = (type: 'inline' | 'widget') => {
    const origin = window.location.origin
    const snippet = type === 'inline'
      ? `<script src="${origin}/embed.js" data-form-id="${id}"></script>`
      : `<script src="${origin}/embed.js" data-form-id="${id}" data-mode="widget" data-color="${color}"></script>`
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const addField = () => {
    setFields(prev => [...prev, {
      name: `campo_${prev.length + 1}`,
      label: `Campo ${prev.length + 1}`,
      type: 'text',
      required: false,
      width: 'full',
    }])
  }

  const updateField = (idx: number, patch: Partial<FormField>) => {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }

  const removeField = (idx: number) => {
    setFields(prev => prev.filter((_, i) => i !== idx))
  }

  const d = (form as FormDetail | undefined)?.analytics
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-xl border animate-pulse" />)}
      </div>
    )
  }

  if (!form) {
    return <p className="text-sm text-slate-500">Formulario no encontrado.</p>
  }

  return (
    <div className="max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/settings/forms')}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{form.name}</h1>
            <p className="text-xs text-slate-400 font-mono">{form.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/embed/form?formId=${id}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border rounded-lg hover:bg-slate-50 transition-colors">
            <ExternalLink size={13} /> Preview
          </a>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save size={13} />
            {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['editor', 'analytics', 'snippet'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {tab === 'editor' ? 'Editor' : tab === 'analytics' ? 'Analytics' : 'Snippet'}
          </button>
        ))}
      </div>

      {/* ── Editor ──────────────────────────────────────────────── */}
      {activeTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
          {/* Left: config + fields */}
          <div className="space-y-5">
            {/* Basic settings */}
            <div className="bg-white rounded-xl border p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-700">Configuración general</h2>
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">Nombre interno</span>
                  <input value={name} onChange={e => setName(e.target.value)} className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">Color principal</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={color} onChange={e => setColor(e.target.value)}
                      className="w-9 h-9 rounded-md border cursor-pointer p-0.5" />
                    <input value={color} onChange={e => setColor(e.target.value)} className={INPUT} />
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">Título del form</span>
                  <input value={title} onChange={e => setTitle(e.target.value)} className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-500">Subtítulo</span>
                  <input value={subtitle} onChange={e => setSubtitle(e.target.value)} className={INPUT} />
                </label>
                <label className="col-span-2 space-y-1">
                  <span className="text-xs font-medium text-slate-500">Tags (separados por coma)</span>
                  <input value={tags} onChange={e => setTags(e.target.value)}
                    placeholder="b2b, ventas, landing" className={INPUT} />
                </label>
              </div>
            </div>

            {/* Fields editor */}
            <div className="bg-white rounded-xl border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Campos del formulario</h2>
                <button onClick={addField}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                  <Plus size={13} /> Agregar campo
                </button>
              </div>

              <div className="space-y-2">
                {fields.map((field, idx) => (
                  <FieldRow
                    key={idx}
                    field={field}
                    onChange={patch => updateField(idx, patch)}
                    onRemove={() => removeField(idx)}
                  />
                ))}
                {fields.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">
                    Sin campos. Agregá al menos uno.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right: live preview */}
          <div className="sticky top-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              Preview en vivo
            </p>
            <FormPreview title={title} subtitle={subtitle} color={color} fields={fields} />
          </div>
        </div>
      )}

      {/* ── Analytics ───────────────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <AnalyticCard icon={Users}          label="Leads totales"  value={d?.total_leads ?? 0} />
            <AnalyticCard icon={Zap}            label="Últimos 7 días" value={d?.leads_7d ?? 0} />
            <AnalyticCard icon={TrendingUp}     label="Conversión"     value={`${d?.conversion_rate ?? 0}%`} />
            <AnalyticCard icon={DollarSign}     label="Revenue est."   value={formatUSD(d?.revenue_usd ?? 0)} />
          </div>

          {/* Funnel */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Embudo de conversión</h2>
            <div className="space-y-3">
              {[
                { label: 'Abiertos',    value: d?.opened ?? 0,    icon: ExternalLink,       color: '#64748b' },
                { label: 'Iniciados',   value: d?.started ?? 0,   icon: MousePointerClick,  color: '#3b82f6' },
                { label: 'Enviados',    value: d?.submitted ?? 0, icon: Check,              color: '#22c55e' },
                { label: 'Abandonados', value: d?.abandoned ?? 0, icon: LogOut,             color: '#f59e0b' },
              ].map(({ label, value, icon: Icon, color: c }) => {
                const max = Math.max(d?.opened ?? 1, 1)
                const pct = Math.round((value / max) * 100)
                return (
                  <div key={label} className="flex items-center gap-3">
                    <Icon size={14} style={{ color: c }} className="flex-shrink-0" />
                    <span className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: c }} />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 w-8 text-right">{value}</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 pt-4 border-t flex gap-6 text-xs text-slate-500">
              <span>Abandono: <strong className="text-slate-700">{d?.abandonment_rate ?? 0}%</strong></span>
              <span>Inicio→Envío: <strong className="text-slate-700">{d?.conversion_rate ?? 0}%</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* ── Snippet ─────────────────────────────────────────────── */}
      {activeTab === 'snippet' && (
        <div className="space-y-4">
          <SnippetBlock
            label="Formulario inline"
            description="Se inserta directamente en el HTML donde pongas el script."
            code={`<script src="${origin}/embed.js" data-form-id="${id}"></script>`}
            copied={copied === 'inline'}
            onCopy={() => copy('inline')}
          />
          <SnippetBlock
            label="Widget flotante"
            description="Muestra un botón flotante en la esquina inferior derecha, como Intercom."
            code={`<script\n  src="${origin}/embed.js"\n  data-form-id="${id}"\n  data-mode="widget"\n  data-color="${color}">\n</script>`}
            copied={copied === 'widget'}
            onCopy={() => copy('widget')}
          />
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">API programática</h3>
            <p className="text-xs text-slate-500">Controlá el widget desde JavaScript:</p>
            <pre className="bg-slate-50 rounded-lg p-4 text-xs text-slate-700 overflow-x-auto">{
`// Abrir / cerrar / toggle
window.AloraLeadForm.open()
window.AloraLeadForm.close()
window.AloraLeadForm.toggle()

// Disparar desde un botón
<button onclick="window.AloraLeadForm.open()">Contactar</button>`
            }</pre>
          </div>
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700">Endpoint webhook</h3>
            <p className="text-xs text-slate-500">Integraciones externas (Zapier, Make, n8n):</p>
            <pre className="bg-slate-50 rounded-lg p-4 text-xs text-slate-700 overflow-x-auto">{
`POST ${origin}/api/webhooks/lead
X-Webhook-Secret: <tu-secreto>

{
  "nombre": "Juan Pérez",
  "email": "juan@empresa.com",
  "telefono": "+54 11 0000-0000"
}`
            }</pre>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ────────────────────────────────────────────── */

function FieldRow({ field, onChange, onRemove }: {
  field: FormField
  onChange: (patch: Partial<FormField>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-start gap-2 p-3 border border-slate-100 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
      <GripVertical size={14} className="text-slate-300 mt-2 flex-shrink-0" />
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input
          value={field.label}
          onChange={e => onChange({ label: e.target.value })}
          placeholder="Label"
          className="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          value={field.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="nombre_campo"
          className="border border-slate-200 rounded px-2 py-1 text-xs bg-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={field.type}
          onChange={e => onChange({ type: e.target.value as FormField['type'] })}
          className="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={field.width ?? 'full'}
          onChange={e => onChange({ width: e.target.value as 'full' | 'half' })}
          className="border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="full">Ancho completo</option>
          <option value="half">Mitad</option>
        </select>
        {field.type === 'select' && (
          <input
            value={(field.options ?? []).join(', ')}
            onChange={e => onChange({ options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            placeholder="Opción 1, Opción 2, ..."
            className="col-span-2 sm:col-span-3 border border-slate-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            checked={field.required ?? false}
            onChange={e => onChange({ required: e.target.checked })}
            className="rounded"
          />
          Requerido
        </label>
      </div>
      <button onClick={onRemove} className="p-1 text-slate-300 hover:text-red-500 transition-colors mt-1">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function AnalyticCard({ icon: Icon, label, value }: {
  icon: React.ElementType; label: string; value: string | number
}) {
  return (
    <div className="bg-white rounded-xl border p-4 space-y-2">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon size={14} />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

/* ── Live Preview ──────────────────────────────────────────────── */

function FormPreview({ title, subtitle, color, fields }: {
  title: string
  subtitle: string
  color: string
  fields: FormField[]
}) {
  // Group fields into rows by width (mirrors embed form logic)
  const rows: FormField[][] = []
  let halfBuffer: FormField | null = null
  for (const field of fields) {
    if (field.width === 'half') {
      if (halfBuffer) { rows.push([halfBuffer, field]); halfBuffer = null }
      else halfBuffer = field
    } else {
      if (halfBuffer) { rows.push([halfBuffer]); halfBuffer = null }
      rows.push([field])
    }
  }
  if (halfBuffer) rows.push([halfBuffer])

  return (
    <div className="bg-white rounded-xl border shadow-md overflow-hidden">
      {/* Form header bar */}
      <div className="h-1.5" style={{ background: color }} />

      <div className="p-5 space-y-4">
        {/* Title */}
        <div>
          <h3 className="font-bold text-slate-900 text-lg leading-tight">
            {title || 'Título del formulario'}
          </h3>
          {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
        </div>

        {/* Fields */}
        {rows.length > 0 ? (
          <div className="space-y-3">
            {rows.map((row, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: row.length === 2 ? '1fr 1fr' : '1fr',
                  gap: 10,
                }}
              >
                {row.map((field) => (
                  <div key={field.name} className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">
                      {field.label || field.name}
                      {field.required && <span className="text-red-400 ml-0.5">*</span>}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        disabled
                        placeholder={field.placeholder || ''}
                        rows={2}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-400 resize-none"
                      />
                    ) : field.type === 'select' ? (
                      <select
                        disabled
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-400"
                      >
                        <option>Seleccionar…</option>
                        {(field.options ?? []).map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input
                        disabled
                        type={field.type === 'phone' ? 'tel' : field.type}
                        placeholder={field.placeholder || ''}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-400"
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center">
            <p className="text-xs text-slate-400">Agregá campos para ver el preview</p>
          </div>
        )}

        {/* CTA button */}
        <button
          disabled
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity"
          style={{ background: color, opacity: 0.85 }}
        >
          Enviar consulta
        </button>

        <p className="text-center text-xs text-slate-300">Powered by Alora CRM</p>
      </div>
    </div>
  )
}

function SnippetBlock({ label, description, code, copied, onCopy }: {
  label: string; description: string; code: string; copied: boolean; onCopy: () => void
}) {
  return (
    <div className="bg-white rounded-xl border p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
        <button onClick={onCopy}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 border rounded-md px-2.5 py-1.5 transition-colors flex-shrink-0">
          {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="bg-slate-50 rounded-lg p-4 text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">{code}</pre>
    </div>
  )
}
