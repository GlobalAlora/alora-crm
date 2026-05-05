'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Users, Eye, Code } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Link from 'next/link'
import type { LeadTag, LeadList, SegmentFilters } from '@/types'
import { PIPELINE_STAGES, SERVICIOS, PAISES } from '@/types'
import { SegmentBuilder } from '@/components/email/SegmentBuilder'

const PREVIEW_LEAD = { nombre: 'Juan', apellido: 'García', email: 'juan@ejemplo.com', empresa: 'ACME SA' }

function interpolatePreview(template: string): string {
  return template
    .replace(/\{\{nombre\}\}/gi, `${PREVIEW_LEAD.nombre} ${PREVIEW_LEAD.apellido}`)
    .replace(/\{\{email\}\}/gi, PREVIEW_LEAD.email)
    .replace(/\{\{empresa\}\}/gi, PREVIEW_LEAD.empresa)
}

export default function NewCampaignPage() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [fromName, setFromName] = useState('Alora CRM')
  const [fromEmail, setFromEmail] = useState('')
  const [filters, setFilters] = useState<SegmentFilters>({})
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [tab, setTab] = useState<'editor' | 'preview'>('editor')

  const { data: tagsData } = useQuery<{ data: LeadTag[] }>({ queryKey: ['tags'], queryFn: () => fetch('/api/tags').then(r => r.json()) })
  const { data: listsData } = useQuery<{ data: LeadList[] }>({ queryKey: ['lists'], queryFn: () => fetch('/api/lists').then(r => r.json()) })

  const tags = tagsData?.data ?? []
  const lists = listsData?.data ?? []

  const previewSegment = async () => {
    setPreviewing(true)
    try {
      const res = await fetch('/api/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      })
      const json = await res.json()
      setPreviewCount(json.count ?? 0)
    } catch {
      toast.error('Error al calcular segmento')
    } finally {
      setPreviewing(false)
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json()),
    onSuccess: (res) => {
      toast.success('Campaña creada')
      router.push(`/email/${res.data.id}`)
    },
    onError: () => toast.error('Error al crear campaña'),
  })

  const handleSave = () => {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      toast.error('Completá nombre, asunto y cuerpo')
      return
    }
    if (!fromEmail.trim()) {
      toast.error('Completá el email remitente')
      return
    }
    createMutation.mutate({ name, subject, body, from_name: fromName, from_email: fromEmail, filters })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/email" className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">Nueva campaña</h1>
      </div>

      {/* Sender + subject */}
      <div className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Detalles</h2>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Nombre interno</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Newsletter Mayo 2026"
            className="w-full text-sm border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Nombre remitente</label>
            <input type="text" value={fromName} onChange={e => setFromName(e.target.value)}
              className="w-full text-sm border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Email remitente</label>
            <input type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="hola@tudominio.com"
              className="w-full text-sm border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Asunto</label>
          <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Asunto del email"
            className="w-full text-sm border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>

      {/* Body editor with preview */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-700">Cuerpo del email</h2>
          <div className="flex rounded-lg border overflow-hidden text-xs">
            <button
              onClick={() => setTab('editor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 ${tab === 'editor' ? 'bg-white text-slate-900 font-medium' : 'text-slate-500 hover:bg-white'}`}
            >
              <Code size={12} /> Editor
            </button>
            <button
              onClick={() => setTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 ${tab === 'preview' ? 'bg-white text-slate-900 font-medium' : 'text-slate-500 hover:bg-white'}`}
            >
              <Eye size={12} /> Preview
            </button>
          </div>
        </div>

        <div className="p-5">
          {tab === 'editor' ? (
            <>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={14}
                placeholder={'<p>Hola {{nombre}},</p>\n<p>Queremos contarte...</p>'}
                className="w-full text-sm border rounded px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
              />
              <p className="text-xs text-slate-400 mt-2">
                Variables disponibles: <code className="bg-slate-100 px-1 rounded">{'{{nombre}}'}</code>{' '}
                <code className="bg-slate-100 px-1 rounded">{'{{empresa}}'}</code>{' '}
                <code className="bg-slate-100 px-1 rounded">{'{{email}}'}</code>
              </p>
            </>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              {/* Simulated email header */}
              <div className="bg-slate-50 px-4 py-3 border-b text-xs text-slate-500 space-y-1">
                <div><span className="font-medium text-slate-700">De:</span> {fromName || 'Remitente'} &lt;{fromEmail || 'email@ejemplo.com'}&gt;</div>
                <div><span className="font-medium text-slate-700">Para:</span> {PREVIEW_LEAD.nombre} {PREVIEW_LEAD.apellido} &lt;{PREVIEW_LEAD.email}&gt;</div>
                <div><span className="font-medium text-slate-700">Asunto:</span> {interpolatePreview(subject) || '(sin asunto)'}</div>
              </div>
              <div
                className="p-6 min-h-[200px] prose prose-sm max-w-none text-slate-800"
                dangerouslySetInnerHTML={{ __html: interpolatePreview(body) || '<p class="text-slate-400">El cuerpo aparecerá aquí...</p>' }}
              />
              <p className="text-xs text-slate-400 px-4 py-2 border-t bg-slate-50">
                Vista previa con datos de ejemplo: {PREVIEW_LEAD.nombre} {PREVIEW_LEAD.apellido} / {PREVIEW_LEAD.empresa}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Segment */}
      <div className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Segmento de destinatarios</h2>
        <SegmentBuilder
          filters={filters}
          onChange={setFilters}
          tags={tags}
          lists={lists}
          stages={PIPELINE_STAGES}
          servicios={SERVICIOS}
          paises={PAISES}
        />

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={previewSegment}
            disabled={previewing}
            className="flex items-center gap-1.5 text-sm border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <Users size={14} /> {previewing ? 'Calculando...' : 'Ver destinatarios'}
          </button>
          {previewCount !== null && (
            <span className="text-sm text-slate-600">
              <strong>{previewCount}</strong> leads con email en este segmento
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={createMutation.isPending}
          className="bg-blue-600 text-white text-sm px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Guardando...' : 'Guardar campaña'}
        </button>
        <Link href="/email" className="text-sm text-slate-500 px-4 py-2.5 rounded-lg hover:bg-slate-100">
          Cancelar
        </Link>
      </div>
    </div>
  )
}
