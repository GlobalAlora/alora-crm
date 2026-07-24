'use client'

import { useState } from 'react'
import { CheckCircle2, Copy, ExternalLink, Loader2 } from 'lucide-react'

type Step = 'form' | 'sending' | 'done'

export default function PortalSubmitPage() {
  const [step, setStep]  = useState<Step>('form')
  const [nombre, setNombre]       = useState('')
  const [email, setEmail]         = useState('')
  const [titulo, setTitulo]       = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<'media' | 'urgente'>('media')
  const [error, setError]         = useState('')
  const [result, setResult]       = useState<{ numero: string; trackingUrl: string } | null>(null)
  const [copied, setCopied]       = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setStep('sending')

    const res = await fetch('/api/portal/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_nombre: nombre, client_email: email, titulo, descripcion, prioridad }),
    })
    const data = await res.json()

    if (!res.ok || data.error) {
      setError(data.error ?? 'Error al enviar el ticket')
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
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <span className="text-white text-sm font-bold">A</span>
          </div>
          <div>
            <span className="text-white font-semibold text-base">Alora</span>
            <span className="text-slate-400 text-sm ml-2">Centro de Soporte</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-lg">

          {step === 'done' && result ? (
            /* ── Success ── */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 size={32} className="text-green-500" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">¡Ticket enviado!</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                Nuestro equipo lo va a revisar y te responderemos a la brevedad. También te enviamos un email con este link.
              </p>

              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-6">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Número de ticket</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white font-mono">{result.numero}</p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={copyLink}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Copy size={15} />
                  {copied ? '¡Link copiado!' : 'Copiar link de seguimiento'}
                </button>
                <a
                  href={result.trackingUrl}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors"
                >
                  <ExternalLink size={15} />
                  Ver mi ticket
                </a>
              </div>
            </div>
          ) : (
            /* ── Form ── */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">Envianos tu consulta</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Completá el formulario y te respondemos a la brevedad.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
                {error && (
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-sm px-4 py-3 rounded-xl">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                      Tu nombre *
                    </label>
                    <input
                      required
                      value={nombre}
                      onChange={e => setNombre(e.target.value)}
                      placeholder="Juan García"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                      Tu email *
                    </label>
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="juan@empresa.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                    Asunto *
                  </label>
                  <input
                    required
                    value={titulo}
                    onChange={e => setTitulo(e.target.value)}
                    placeholder="Ej: No puedo acceder a mi cuenta"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                    Descripción
                  </label>
                  <textarea
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    rows={4}
                    placeholder="Contanos con más detalle lo que necesitás..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
                    Urgencia
                  </label>
                  <div className="flex gap-3">
                    {(['media', 'urgente'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPrioridad(p)}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                          prioridad === p
                            ? p === 'urgente'
                              ? 'bg-red-500 border-red-500 text-white'
                              : 'bg-blue-500 border-blue-500 text-white'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        {p === 'media' ? 'Normal' : 'Urgente'}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={step === 'sending'}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:bg-slate-700 dark:hover:bg-slate-100 disabled:opacity-60 transition-colors"
                >
                  {step === 'sending' ? (
                    <><Loader2 size={16} className="animate-spin" /> Enviando...</>
                  ) : (
                    'Enviar solicitud'
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Footer */}
          <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-6">
            Alora Digital · <a href="https://globalalora.com" className="hover:text-slate-600 dark:hover:text-slate-400 transition-colors">globalalora.com</a>
          </p>
        </div>
      </main>
    </div>
  )
}
