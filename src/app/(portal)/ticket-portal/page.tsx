'use client'

import { useState, useRef } from 'react'
import {
  CheckCircle2, Copy, Loader2,
  Paperclip, X, FileVideo, AlertTriangle,
  ChevronRight,
} from 'lucide-react'

// ─── Logo Alora ─────────────────────────────────────────────

function AloraLogo() {
  return (
    <img
      src="https://www.globalalora.com/logo-nav-white.png"
      alt="Alora"
      style={{ height: 36, display: 'block', objectFit: 'contain' }}
    />
  )
}

// ─── Urgency levels ──────────────────────────────────────────

type Prioridad = 'media' | 'alta' | 'urgente'

const URGENCIAS: { value: Prioridad; label: string; sub: string; color: string; bg: string; ring: string }[] = [
  {
    value: 'media',
    label: 'Normal',
    sub: 'Podés atender cuando tengas tiempo',
    color: '#2563eb',
    bg: '#eff6ff',
    ring: '#93c5fd',
  },
  {
    value: 'alta',
    label: 'Alta',
    sub: 'Necesito resolución en el día',
    color: '#ea580c',
    bg: '#fff7ed',
    ring: '#fdba74',
  },
  {
    value: 'urgente',
    label: 'Urgente',
    sub: 'Impacta mi operación ahora mismo',
    color: '#dc2626',
    bg: '#fef2f2',
    ring: '#fca5a5',
  },
]

// ─── Types ───────────────────────────────────────────────────

interface UploadedFile {
  file: File
  preview: string | null  // ObjectURL for images
  url?: string            // after upload
  error?: string
}

type Step = 'form' | 'uploading' | 'creating' | 'done'

// ─── Field ───────────────────────────────────────────────────

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = `
  w-full px-4 py-2.5 rounded-xl text-sm transition-all outline-none
  border border-[#e2e8f0] bg-[#f8fafc] text-[#0f172a] placeholder:text-[#94a3b8]
  focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:bg-white
`.replace(/\s+/g, ' ').trim()

// ─── Page ────────────────────────────────────────────────────

export default function PortalSubmitPage() {
  const [step, setStep] = useState<Step>('form')
  const [nombre, setNombre]       = useState('')
  const [empresa, setEmpresa]     = useState('')
  const [email, setEmail]         = useState('')
  const [telefono, setTelefono]   = useState('')
  const [titulo, setTitulo]       = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<Prioridad>('media')
  const [uploads, setUploads]     = useState<UploadedFile[]>([])
  const [dragOver, setDragOver]   = useState(false)
  const [error, setError]         = useState('')
  const [result, setResult]       = useState<{ numero: string; trackingUrl: string } | null>(null)
  const [copied, setCopied]       = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── File handling ──────────────────────────────────────────

  function addFiles(fileList: FileList | null) {
    if (!fileList) return
    const remaining = 5 - uploads.length
    const newFiles  = Array.from(fileList).slice(0, remaining)

    const newUploads: UploadedFile[] = newFiles.map(file => ({
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

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  // ── Submit ─────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // 1. Upload files
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

    // 2. Create ticket
    setStep('creating')
    const res  = await fetch('/api/portal/tickets', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        client_nombre:   nombre,
        client_email:    email,
        client_empresa:  empresa,
        client_telefono: telefono,
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

    setResult(data.data)
    setStep('done')
  }

  function copyLink() {
    if (!result) return
    navigator.clipboard.writeText(result.trackingUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const isLoading = step === 'uploading' || step === 'creating'
  const loadingMsg = step === 'uploading' ? 'Subiendo archivos...' : 'Enviando solicitud...'

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* ── Header ── */}
      <header style={{ background: '#0f172a', borderBottom: '1px solid #1e293b' }}>
        <div style={{ maxWidth: 660, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <AloraLogo />
          <span style={{ color: '#64748b', fontSize: 13 }}>Centro de Soporte</span>
        </div>
      </header>

      <main style={{ maxWidth: 660, margin: '0 auto', padding: '40px 24px 60px' }}>

        {step === 'done' && result ? (
          /* ── ✅ Success ── */
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', padding: 48, textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <CheckCircle2 size={36} color="#16a34a" />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>¡Solicitud enviada!</h1>
            <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 32px' }}>
              Nuestro equipo ya recibió tu ticket y te vamos a responder a la brevedad.<br />
              También te mandamos un email con el link de seguimiento.
            </p>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '20px 24px', marginBottom: 28, display: 'inline-block', minWidth: 240 }}>
              <p style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Número de ticket</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', margin: 0, letterSpacing: 1 }}>{result.numero}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={copyLink}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 20px', borderRadius: 12, border: '1.5px solid #e2e8f0',
                  background: copied ? '#f0fdf4' : '#fff', color: copied ? '#16a34a' : '#334155',
                  fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all .2s',
                }}
              >
                <Copy size={15} />
                {copied ? '¡Link copiado!' : 'Copiar link de seguimiento'}
              </button>
              <a
                href={result.trackingUrl}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 20px', borderRadius: 12, background: '#0f172a', color: '#fff',
                  fontSize: 14, fontWeight: 600, textDecoration: 'none',
                }}
              >
                Seguir mi ticket <ChevronRight size={15} />
              </a>
            </div>
          </div>

        ) : (
          <>
            {/* ── Hero text ── */}
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 8px', lineHeight: 1.2 }}>
                ¿En qué podemos ayudarte?
              </h1>
              <p style={{ fontSize: 15, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                Completá el formulario y nuestro equipo te responde a la brevedad.
              </p>
            </div>

            {/* ── Form card ── */}
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

              {/* Error banner */}
              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '14px 24px' }}>
                  <AlertTriangle size={16} color="#ef4444" />
                  <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit}>

                {/* Section 1 — Datos de contacto */}
                <div style={{ padding: '28px 28px 0' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
                    Tus datos
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Nombre" required>
                      <input required value={nombre} onChange={e => setNombre(e.target.value)}
                        placeholder="Juan García" className={inputCls} />
                    </Field>
                    <Field label="Empresa" required>
                      <input required value={empresa} onChange={e => setEmpresa(e.target.value)}
                        placeholder="Mi Empresa S.A." className={inputCls} />
                    </Field>
                    <Field label="Email" required>
                      <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="juan@empresa.com" className={inputCls} />
                    </Field>
                    <Field label="Teléfono" required>
                      <input required type="tel" value={telefono} onChange={e => setTelefono(e.target.value)}
                        placeholder="+54 11 1234-5678" className={inputCls} />
                    </Field>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#f1f5f9', margin: '24px 0' }} />

                {/* Section 2 — Consulta */}
                <div style={{ padding: '0 28px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
                    Tu consulta
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Field label="Asunto" required>
                      <input required value={titulo} onChange={e => setTitulo(e.target.value)}
                        placeholder="Ej: No puedo acceder a mi sitio web"
                        className={inputCls} />
                    </Field>
                    <Field label="Descripción" required>
                      <textarea
                        required
                        value={descripcion} onChange={e => setDescripcion(e.target.value)}
                        rows={4}
                        placeholder="Contanos con más detalle lo que necesitás. Cuanto más info, mejor podemos ayudarte."
                        className={inputCls}
                        style={{ resize: 'vertical', minHeight: 100 }}
                      />
                    </Field>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#f1f5f9', margin: '24px 0' }} />

                {/* Section 3 — Urgencia */}
                <div style={{ padding: '0 28px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
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
                            padding: '14px 12px',
                            borderRadius: 12,
                            border: `2px solid ${sel ? u.color : '#e2e8f0'}`,
                            background: sel ? u.bg : '#f8fafc',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all .15s',
                            boxShadow: sel ? `0 0 0 3px ${u.ring}40` : 'none',
                          }}
                        >
                          <div style={{
                            display: 'inline-block',
                            width: 8, height: 8, borderRadius: '50%',
                            background: u.color, marginBottom: 8,
                          }} />
                          <p style={{ fontSize: 14, fontWeight: 700, color: sel ? u.color : '#334155', margin: '0 0 4px' }}>{u.label}</p>
                          <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.4 }}>{u.sub}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#f1f5f9', margin: '24px 0' }} />

                {/* Section 4 — Archivos */}
                <div style={{ padding: '0 28px 28px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
                    Adjuntar archivos <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional · máx. 5 archivos · 10 MB c/u)</span>
                  </p>

                  {/* Dropzone */}
                  {uploads.length < 5 && (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={onDrop}
                      style={{
                        border: `2px dashed ${dragOver ? '#3b82f6' : '#cbd5e1'}`,
                        borderRadius: 14,
                        padding: '28px 24px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: dragOver ? '#eff6ff' : '#f8fafc',
                        transition: 'all .15s',
                        marginBottom: uploads.length ? 12 : 0,
                      }}
                    >
                      <Paperclip size={24} color={dragOver ? '#3b82f6' : '#94a3b8'} style={{ margin: '0 auto 10px', display: 'block' }} />
                      <p style={{ fontSize: 14, fontWeight: 600, color: dragOver ? '#2563eb' : '#475569', margin: '0 0 4px' }}>
                        Arrastrá archivos acá o hacé click para seleccionar
                      </p>
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                        JPG, PNG, GIF, WEBP, MP4, MOV, WEBM
                      </p>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
                    style={{ display: 'none' }}
                    onChange={e => addFiles(e.target.files)}
                  />

                  {/* File previews */}
                  {uploads.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                      {uploads.map((u, i) => (
                        <div key={i} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', aspectRatio: '1', background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
                          {u.preview ? (
                            <img src={u.preview} alt={u.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <FileVideo size={22} color="#64748b" />
                              <span style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center', padding: '0 4px', lineHeight: 1.3, wordBreak: 'break-all' }}>
                                {u.file.name.slice(0, 12)}{u.file.name.length > 12 ? '…' : ''}
                              </span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            style={{
                              position: 'absolute', top: 4, right: 4,
                              width: 20, height: 20, borderRadius: '50%',
                              background: 'rgba(15,23,42,0.7)', border: 'none',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer',
                            }}
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
                      transition: 'background .2s',
                    }}
                  >
                    {isLoading ? (
                      <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> {loadingMsg}</>
                    ) : (
                      <>Enviar solicitud <ChevronRight size={18} /></>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 28 }}>
          <a href="https://globalalora.com" style={{ color: '#94a3b8', textDecoration: 'none' }}>
            Alora Digital · globalalora.com
          </a>
        </p>
      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        * { box-sizing: border-box }
      `}</style>
    </div>
  )
}
