'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import type { FormConfig, FormField } from '@/app/api/embed/config/route'

/* ── Event tracking helpers ────────────────────────────────────── */
function useFormTracking(formId: string) {
  const sessionId = useRef(crypto.randomUUID())
  const hasStarted = useRef(false)
  const hasSubmitted = useRef(false)

  const track = useCallback((eventType: string, metadata?: Record<string, unknown>) => {
    if (!formId) return
    const payload = { form_id: formId, event_type: eventType, session_id: sessionId.current, metadata }
    // Also notify parent embed.js via postMessage (for widget mode)
    window.parent.postMessage({ type: 'alora:event', formId, eventType, metadata }, '*')
    // Direct fire (works in inline mode and standalone)
    fetch('/api/embed/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {})
  }, [formId])

  const trackStart = useCallback(() => {
    if (hasStarted.current) return
    hasStarted.current = true
    track('form_started')
  }, [track])

  const trackSubmit = useCallback(() => {
    hasSubmitted.current = true
    track('form_submitted')
  }, [track])

  // Abandoned: user leaves without submitting after starting
  useEffect(() => {
    if (!formId) return
    const handleUnload = () => {
      if (!hasStarted.current || hasSubmitted.current) return
      const payload = JSON.stringify({
        form_id: formId, event_type: 'form_abandoned', session_id: sessionId.current, metadata: {},
      })
      navigator.sendBeacon('/api/embed/events', new Blob([payload], { type: 'application/json' }))
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [formId])

  return { trackStart, trackSubmit }
}

const INPUT_BASE = `
  width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;
  font-size:14px;color:#1e293b;background:#fff;outline:none;
  box-sizing:border-box;font-family:inherit;transition:border-color .15s;
`

const KNOWN_LEAD_FIELDS = new Set([
  'nombre', 'email', 'telefono', 'empresa',
  'servicio_interesado', 'mensaje', 'presupuesto_estimado',
])

/* ── Field renderer ────────────────────────────────────────────── */
function Field({ field, value, onChange, error }: {
  field: FormField
  value: string
  onChange: (v: string) => void
  error: boolean
}) {
  const borderColor = error ? '#ef4444' : '#e2e8f0'
  const style = { cssText: INPUT_BASE + `border-color:${borderColor}` } as React.CSSProperties

  // Checkbox renders differently — inline label + checkbox
  if (field.type === 'checkbox') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={e => onChange(e.target.checked ? 'true' : '')}
            style={{ marginTop: 2, flexShrink: 0, width: 15, height: 15, accentColor: '#2563eb', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 13, color: error ? '#ef4444' : '#475569', lineHeight: 1.4 }}>
            {field.placeholder || field.label}
            {field.required && <span style={{ color: '#ef4444' }}> *</span>}
          </span>
        </label>
        {error && (
          <span style={{ fontSize: 11, color: '#ef4444' }}>Debes aceptar para continuar</span>
        )}
      </div>
    )
  }

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
        {field.label}
        {field.required && <span style={{ color: '#ef4444' }}> *</span>}
      </span>

      {field.type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          style={{ cssText: INPUT_BASE + `border-color:${borderColor};resize:vertical;min-height:80px` } as React.CSSProperties}
        />
      ) : field.type === 'select' ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ cssText: INPUT_BASE + `border-color:${borderColor};appearance:none;cursor:pointer` } as React.CSSProperties}
        >
          <option value="">Seleccionar…</option>
          {(field.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={field.type === 'phone' ? 'tel' : field.type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          style={style}
        />
      )}

      {error && (
        <span style={{ fontSize: 11, color: '#ef4444' }}>
          {field.label} es requerido
        </span>
      )}
    </label>
  )
}

/* ── Main form ─────────────────────────────────────────────────── */
function EmbedFormInner() {
  const params = useSearchParams()
  const formId = params.get('formId') || ''
  const colorOverride = params.get('color') || ''

  const [config, setConfig] = useState<FormConfig | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const honeypotRef = useRef<HTMLInputElement>(null)
  const { trackStart, trackSubmit } = useFormTracking(formId)

  // Fetch config
  useEffect(() => {
    const url = `/api/embed/config${formId ? `?formId=${formId}` : ''}`
    fetch(url)
      .then(r => r.json())
      .then(j => {
        setConfig(j.data)
        const init: Record<string, string> = {}
        for (const f of j.data.fields) init[f.name] = ''
        setValues(init)
      })
      .catch(() => {
        // Minimal fallback so the form is never blank
        const fallback: FormConfig = {
          title: '¿Hablamos?', subtitle: 'Completá el formulario y te contactamos.',
          color: '#2563eb', tags: [],
          fields: [
            { name: 'nombre', label: 'Nombre', type: 'text', required: true, width: 'full' },
            { name: 'email',  label: 'Email',  type: 'email', width: 'full' },
          ],
        }
        setConfig(fallback)
        setValues({ nombre: '', email: '' })
      })
  }, [formId])

  // Notify parent iframe of height changes
  const notifyResize = useCallback(() => {
    const h = document.documentElement.scrollHeight
    window.parent.postMessage({ type: 'alora:resize', height: h }, '*')
  }, [])

  useEffect(() => { notifyResize() }, [config, status, errorMsg, notifyResize])

  const color = colorOverride || config?.color || '#2563eb'

  const set = (name: string) => (v: string) => {
    trackStart()
    setValues(prev => ({ ...prev, [name]: v }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: false }))
  }

  const validate = (): boolean => {
    if (!config) return false
    const newErrors: Record<string, boolean> = {}
    let valid = true
    for (const field of config.fields) {
      const val = values[field.name]
      // Checkbox required = must be checked (value === 'true')
      const isEmpty = field.type === 'checkbox'
        ? val !== 'true'
        : !val?.trim()
      if (field.required && isEmpty) {
        newErrors[field.name] = true
        valid = false
      }
    }
    setErrors(newErrors)
    return valid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (honeypotRef.current?.value) return
    if (!validate()) return

    setStatus('sending')
    setErrorMsg('')

    // Map known fields; rest goes to metadata
    const knownFields: Record<string, string> = {}
    const extraFields: Record<string, string> = {}
    for (const [k, v] of Object.entries(values)) {
      if (!v.trim()) continue
      if (KNOWN_LEAD_FIELDS.has(k)) knownFields[k] = v
      else extraFields[k] = v
    }

    try {
      const res = await fetch('/api/embed/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...knownFields,
          notas: knownFields.mensaje,
          formId: formId || undefined,
          extra_fields: Object.keys(extraFields).length ? extraFields : undefined,
          tags: config?.tags?.length ? config.tags : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al enviar')
      trackSubmit()
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Error al enviar el formulario')
    }
  }

  if (!config) {
    return (
      <div style={{ padding: '40px 24px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: `3px solid ${color}`, borderTopColor: 'transparent', animation: 'alora-spin 0.7s linear infinite' }} />
        <style>{`@keyframes alora-spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 280, padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#0f172a' }}>¡Mensaje recibido!</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#64748b', maxWidth: 300 }}>
          Gracias por contactarte. Te vamos a responder en las próximas 24 horas.
        </p>
      </div>
    )
  }

  // Group fields into rows by width
  const rows: FormField[][] = []
  let halfBuffer: FormField | null = null
  for (const field of config.fields) {
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
    <div style={{ padding: '28px 24px', maxWidth: 540, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{config.title}</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>{config.subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
        {/* Honeypot */}
        <input ref={honeypotRef} name="website" type="text" tabIndex={-1} autoComplete="off"
          style={{ display: 'none' }} aria-hidden="true" />

        {rows.map((row, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: row.length === 2 ? '1fr 1fr' : '1fr',
            gap: 12,
          }}>
            {row.map(field => (
              <Field
                key={field.name}
                field={field}
                value={values[field.name] ?? ''}
                onChange={set(field.name)}
                error={!!errors[field.name]}
              />
            ))}
          </div>
        ))}

        {(errorMsg || status === 'error') && (
          <p style={{ margin: 0, fontSize: 13, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px' }}>
            {errorMsg || 'Error al enviar el formulario. Intentá de nuevo.'}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'sending'}
          style={{
            marginTop: 4,
            background: status === 'sending' ? '#94a3b8' : color,
            color: '#fff', border: 'none', borderRadius: 8, padding: '12px 20px',
            fontSize: 14, fontWeight: 600,
            cursor: status === 'sending' ? 'not-allowed' : 'pointer',
            transition: 'background .15s', fontFamily: 'inherit',
          }}
        >
          {status === 'sending' ? 'Enviando…' : 'Enviar consulta'}
        </button>
      </form>
    </div>
  )
}

export default function EmbedFormPage() {
  return (
    <Suspense>
      <EmbedFormInner />
    </Suspense>
  )
}
