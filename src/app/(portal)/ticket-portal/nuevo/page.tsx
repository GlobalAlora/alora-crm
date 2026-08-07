'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, Loader2, Paperclip, X, FileVideo, AlertTriangle, ArrowLeft,
} from 'lucide-react'
import type { TicketPrioridad } from '@/types'

interface PortalClient {
  id: string
  email: string
  nombre: string
  empresa: string | null
  plan_horas_mensual: number
}

interface UploadedFile {
  file: File
  preview: string | null
  url?: string
}

type Step = 'form' | 'uploading' | 'creating'

const URGENCIAS: { value: TicketPrioridad; label: string; sub: string; color: string; bg: string; ring: string }[] = [
  { value: 'media',   label: 'Normal',  sub: 'Podés atender cuando tengas tiempo',   color: '#2563eb', bg: '#eff6ff', ring: '#93c5fd' },
  { value: 'alta',    label: 'Alta',    sub: 'Necesito resolución en el día',          color: '#ea580c', bg: '#fff7ed', ring: '#fdba74' },
  { value: 'urgente', label: 'Urgente', sub: 'Impacta mi operación ahora mismo',       color: '#dc2626', bg: '#fef2f2', ring: '#fca5a5' },
]

const inputCls = `
  w-full px-4 py-2.5 rounded-xl text-sm transition-all outline-none
  border border-[#e2e8f0] bg-[#f8fafc] text-[#0f172a] placeholder:text-[#94a3b8]
  focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white
`.replace(/\s+/g, ' ').trim()

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

export default function NuevoTicketPage() {
  const router = useRouter()
  const [client, setClient] = useState<PortalClient | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const [step, setStep]               = useState<Step>('form')
  const [telefono, setTelefono]       = useState('')
  const [titulo, setTitulo]           = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad]     = useState<TicketPrioridad>('media')
  const [uploads, setUploads]         = useState<UploadedFile[]>([])
  const [dragOver, setDragOver]       = useState(false)
  const [error, setError]             = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/portal/auth/me')
      .then(async res => {
        if (res.status === 401) { router.replace('/login'); return }
        const data = await res.json()
        setClient(data.data)
        setAuthLoading(false)
      })
      .catch(() => router.replace('/login'))
  }, [router])

  function addFiles(fileList: FileList | null) {
    if (!fileList) return
    const remaining = 5 - uploads.length
    const newUploads: UploadedFile[] = Array.from(fileList).slice(0, remaining).map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }))
    setUploads(prev => [...prev, ...newUploads])
  }

  function removeFile(index: number) {
    setUploads(prev => {
      const copy = [...prev]
      if (copy[index].preview) URL.revokeObjectURL(copy[index].preview!)
      copy.splice(index, 1)
      return copy
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!client) return
    setError('')

    let attachments: { url: string; name: string; type: string }[] = []
    if (uploads.length > 0) {
      setStep('uploading')
      const results = await Promise.all(
        uploads.map(async (u) => {
          const fd = new FormData()
          fd.append('file', u.file)
          const res  = await fetch('/api/portal/upload', { method: 'POST', body: fd })
          const data = await res.json()
          return res.ok ? data : null
        })
      )
      attachments = results.filter(Boolean)
    }

    setStep('creating')
    const res = await fetch('/api/portal/tickets', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        client_nombre:   client.nombre,
        client_email:    client.email,
        client_empresa:  client.empresa,
        client_telefono: telefono || null,
        titulo,
        descripcion,
        prioridad,
        attachments,
      }),
    })
    const data = await res.json()

    if (!res.ok || data.error) {
      setError(data.error ?? 'Error al enviar el ticket. Intentá de nuevo.')
      setStep('form')
      return
    }

    router.replace('/dashboard')
  }

  const isLoading = step === 'uploading' || step === 'creating'
  const loadingMsg = step === 'uploading' ? 'Subiendo archivos...' : 'Enviando solicitud...'

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} color="#64748b" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <header style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
        <div style={{ maxWidth: 660, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: 4 }}
          >
            <ArrowLeft size={18} />
          </button>
          <img src="/logo-nav-white.png" alt="Alora" style={{ height: 30, objectFit: 'contain' }} />
          <span style={{ color: '#64748b', fontSize: 13 }}>Nuevo ticket</span>
        </div>
      </header>

      <main style={{ maxWidth: 660, margin: '0 auto', padding: '32px 24px 60px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Crear nuevo ticket</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            Contanos qué necesitás y nuestro equipo te responde a la brevedad.
          </p>
        </div>

        {/* Client info banner */}
        {client && (
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>
                {client.nombre.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#0c4a6e', margin: 0 }}>{client.nombre}</p>
              <p style={{ fontSize: 11, color: '#0369a1', margin: 0 }}>{client.email}{client.empresa ? ` · ${client.empresa}` : ''}</p>
            </div>
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '14px 24px' }}>
              <AlertTriangle size={16} color="#ef4444" />
              <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Teléfono (opcional) */}
            <div style={{ padding: '24px 28px 0' }}>
              <Field label="Teléfono de contacto">
                <input
                  type="tel"
                  value={telefono}
                  onChange={e => setTelefono(e.target.value)}
                  placeholder="+54 351 123-4567"
                  className={inputCls}
                />
              </Field>
            </div>

            <div style={{ height: 1, background: '#f1f5f9', margin: '20px 0' }} />

            {/* Asunto y descripción */}
            <div style={{ padding: '0 28px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
                Tu consulta
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="Asunto" required>
                  <input
                    required
                    value={titulo}
                    onChange={e => setTitulo(e.target.value)}
                    placeholder="Ej: No puedo acceder a mi sitio web"
                    className={inputCls}
                  />
                </Field>
                <Field label="Descripción" required>
                  <textarea
                    required
                    minLength={30}
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    rows={4}
                    placeholder="Contanos con más detalle lo que necesitás."
                    className={inputCls}
                    style={{ resize: 'vertical', minHeight: 100 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: descripcion.length < 30 ? '#f97316' : '#16a34a', fontVariantNumeric: 'tabular-nums' }}>
                      {descripcion.length} / 30 mín.
                    </span>
                  </div>
                </Field>
              </div>
            </div>

            <div style={{ height: 1, background: '#f1f5f9', margin: '20px 0' }} />

            {/* Urgencia */}
            <div style={{ padding: '0 28px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                Nivel de urgencia
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {URGENCIAS.map(u => {
                  const sel = prioridad === u.value
                  return (
                    <button
                      key={u.value}
                      type="button"
                      onClick={() => setPrioridad(u.value)}
                      style={{
                        padding: '12px 10px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
                        border: `2px solid ${sel ? u.color : '#e2e8f0'}`,
                        background: sel ? u.bg : '#f8fafc',
                        boxShadow: sel ? `0 0 0 3px ${u.ring}40` : 'none',
                      }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: u.color, marginBottom: 8 }} />
                      <p style={{ fontSize: 13, fontWeight: 700, color: sel ? u.color : '#334155', margin: '0 0 3px' }}>{u.label}</p>
                      <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.4 }}>{u.sub}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ height: 1, background: '#f1f5f9', margin: '20px 0' }} />

            {/* Archivos */}
            <div style={{ padding: '0 28px 24px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                Adjuntar archivos <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional · máx. 5)</span>
              </p>

              {uploads.length < 5 && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
                  style={{
                    border: `2px dashed ${dragOver ? '#3b82f6' : '#cbd5e1'}`, borderRadius: 14,
                    padding: '24px', textAlign: 'center', cursor: 'pointer',
                    background: dragOver ? '#eff6ff' : '#f8fafc', transition: 'all .15s',
                    marginBottom: uploads.length ? 12 : 0,
                  }}
                >
                  <Paperclip size={22} color={dragOver ? '#3b82f6' : '#94a3b8'} style={{ margin: '0 auto 8px', display: 'block' }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: dragOver ? '#2563eb' : '#475569', margin: '0 0 4px' }}>
                    Arrastrá o hacé click para seleccionar
                  </p>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>JPG, PNG, GIF, MP4, MOV</p>
                </div>
              )}

              <input
                ref={fileInputRef} type="file" multiple
                accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
                style={{ display: 'none' }}
                onChange={e => addFiles(e.target.files)}
              />

              {uploads.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {uploads.map((u, i) => (
                    <div key={i} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '1', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                      {u.preview
                        ? <img src={u.preview} alt={u.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            <FileVideo size={20} color="#64748b" />
                            <span style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center', padding: '0 4px', lineHeight: 1.3, wordBreak: 'break-all' }}>
                              {u.file.name.slice(0, 12)}{u.file.name.length > 12 ? '…' : ''}
                            </span>
                          </div>
                      }
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(15,23,42,0.7)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <X size={11} color="#fff" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit */}
            <div style={{ padding: '0 28px 28px' }}>
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '14px 24px', borderRadius: 12, border: 'none',
                  background: isLoading ? '#94a3b8' : '#0f172a',
                  color: '#fff', fontSize: 15, fontWeight: 700,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {isLoading
                  ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> {loadingMsg}</>
                  : <>Enviar solicitud <ChevronRight size={18} /></>
                }
              </button>
            </div>
          </form>
        </div>
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        * { box-sizing: border-box }
      `}</style>
    </div>
  )
}
