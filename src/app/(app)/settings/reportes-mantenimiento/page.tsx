'use client'

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, FileText, Loader2, X, Download, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────

interface PortalClientOption {
  id: string
  nombre: string
  empresa: string | null
}

interface MaintenanceReport {
  id: string
  client_id: string
  titulo: string
  mes: string
  contenido: string | null
  archivo_url: string | null
  archivo_nombre: string | null
  created_at: string
  portal_clients: { nombre: string; empresa: string | null } | null
}

// ─── Helpers ──────────────────────────────────────────────────

function formatMes(mes: string) {
  const [y, m] = mes.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────

export default function ReportesMantenimientoPage() {
  const qc = useQueryClient()
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [showModal, setShowModal]           = useState(false)

  // Client list
  const { data: clientsData } = useQuery<{ data: PortalClientOption[] }>({
    queryKey: ['portal-clients-list'],
    queryFn: () => fetch('/api/admin/portal-clients').then(r => r.json()),
  })
  const clients = clientsData?.data ?? []

  // Reports list
  const { data: reportsData, isLoading } = useQuery<{ data: MaintenanceReport[] }>({
    queryKey: ['maintenance-reports', selectedClient],
    queryFn: () => {
      const url = selectedClient === 'all'
        ? '/api/admin/maintenance-reports'
        : `/api/admin/maintenance-reports?client_id=${selectedClient}`
      return fetch(url).then(r => r.json())
    },
  })
  const reports = reportsData?.data ?? []

  const del = useMutation({
    mutationFn: (id: string) => fetch(`/api/admin/maintenance-reports/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: (j) => {
      if (j.error) { toast.error(j.error); return }
      toast.success('Reporte eliminado')
      qc.invalidateQueries({ queryKey: ['maintenance-reports'] })
    },
  })

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
            <FileText size={17} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Reportes de mantenimiento</h1>
            <p className="text-xs text-muted-foreground">Informes mensuales visibles por el cliente en su portal</p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          <Plus size={15} /> Nuevo reporte
        </button>
      </div>

      {/* Client filter */}
      <div className="mb-5">
        <select
          value={selectedClient}
          onChange={e => setSelectedClient(e.target.value)}
          className="px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
        >
          <option value="all">Todos los clientes</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>
              {c.nombre}{c.empresa ? ` · ${c.empresa}` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Reports table */}
      <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-muted-foreground" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText size={32} className="text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No hay reportes todavía</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              Crear el primero
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border">
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mes</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Título</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Archivo</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {reports.map(r => (
                <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-5 py-3.5 text-foreground capitalize font-medium whitespace-nowrap">
                    {formatMes(r.mes)}
                  </td>
                  <td className="px-5 py-3.5 text-foreground max-w-[200px]">
                    <span className="block truncate">{r.titulo}</span>
                    {r.contenido && (
                      <span className="text-xs text-muted-foreground">Con descripción</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                    {r.portal_clients?.nombre ?? '—'}
                    {r.portal_clients?.empresa && (
                      <span className="text-xs text-muted-foreground/60 ml-1">· {r.portal_clients.empresa}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    {r.archivo_url ? (
                      <a
                        href={r.archivo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-blue-600 hover:underline text-xs"
                      >
                        <Download size={12} />
                        {r.archivo_nombre ?? 'Ver archivo'}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => {
                        if (!confirm('¿Eliminar este reporte?')) return
                        del.mutate(r.id)
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-950 text-muted-foreground hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <CreateModal
          clients={clients}
          defaultClientId={selectedClient !== 'all' ? selectedClient : ''}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false)
            qc.invalidateQueries({ queryKey: ['maintenance-reports'] })
          }}
        />
      )}
    </div>
  )
}

// ─── Create Modal ─────────────────────────────────────────────

function CreateModal({
  clients,
  defaultClientId,
  onClose,
  onCreated,
}: {
  clients: PortalClientOption[]
  defaultClientId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [clientId,  setClientId]  = useState(defaultClientId || (clients[0]?.id ?? ''))
  const [titulo,    setTitulo]    = useState('')
  const [mes,       setMes]       = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [contenido, setContenido] = useState('')
  const [uploading, setUploading] = useState(false)
  const [archivoUrl,    setArchivoUrl]    = useState('')
  const [archivoNombre, setArchivoNombre] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/upload-document', { method: 'POST', body: fd })
      const j = await res.json()
      if (j.error) { toast.error(j.error); return }
      setArchivoUrl(j.url)
      setArchivoNombre(j.name)
      toast.success('Archivo subido')
    } catch {
      toast.error('Error al subir archivo')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId || !titulo.trim() || !mes) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/maintenance-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id:      clientId,
          titulo:         titulo.trim(),
          mes,
          contenido:      contenido.trim() || null,
          archivo_url:    archivoUrl || null,
          archivo_nombre: archivoNombre || null,
        }),
      })
      const j = await res.json()
      if (j.error) { toast.error(j.error); return }
      toast.success('Reporte creado')
      onCreated()
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card border border-card-border rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-card-border">
          <h2 className="text-base font-semibold text-foreground">Nuevo reporte de mantenimiento</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Client */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Cliente</label>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
            >
              <option value="">Seleccioná un cliente</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre}{c.empresa ? ` · ${c.empresa}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Mes */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Mes del reporte</label>
            <input
              type="month"
              value={mes}
              onChange={e => setMes(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
            />
          </div>

          {/* Título */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Título</label>
            <input
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ej: Informe de mantenimiento julio 2025"
              required
              className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none"
            />
          </div>

          {/* Contenido */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Descripción <span className="font-normal text-muted-foreground/60 normal-case">(opcional)</span>
            </label>
            <textarea
              value={contenido}
              onChange={e => setContenido(e.target.value)}
              rows={4}
              placeholder="Resumen de las tareas realizadas durante el mes..."
              className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none resize-none"
            />
          </div>

          {/* Archivo PDF */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Archivo PDF <span className="font-normal text-muted-foreground/60 normal-case">(opcional)</span>
            </label>
            <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />
            {archivoUrl ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                <FileText size={14} className="text-green-600 shrink-0" />
                <span className="text-sm text-green-700 dark:text-green-400 flex-1 truncate">{archivoNombre}</span>
                <button
                  type="button"
                  onClick={() => { setArchivoUrl(''); setArchivoNombre('') }}
                  className="text-green-500 hover:text-green-700"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border border-dashed border-card-border text-sm text-muted-foreground hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? 'Subiendo...' : 'Seleccionar archivo (PDF, imagen — máx 20MB)'}
              </button>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-card-border text-sm text-muted-foreground hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !clientId || !titulo.trim() || !mes}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? 'Guardando...' : 'Crear reporte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
