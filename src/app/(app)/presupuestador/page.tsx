'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Send, Loader2, Copy, ExternalLink, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PropuestaDocument } from '@/components/propuestas/PropuestaDocument'
import { PropuestaResumenDocument } from '@/components/propuestas/PropuestaResumenDocument'
import type { PropuestaDocumentos } from '@/types'
import toast from 'react-hot-toast'

interface LeadResult {
  id: string
  nombre: string
  apellido: string | null
  empresa: string | null
  estado_pipeline: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

type Draft = PropuestaDocumentos

interface ReunionEncontrada {
  archivos: { nombre: string; fecha: string | null; url: string; tipo: 'notas' | 'transcripcion' }[]
  coincideConFechaReunion: boolean | null
}

interface RecentPropuesta {
  id: string
  descripcion: string
  contenido: Draft
  created_at: string
  lead: LeadResult | LeadResult[] | null
}

// Workspace en curso (lead + chat + borrador todavía sin guardar) persistido
// en sessionStorage -- sin esto, navegar a otra pantalla del CRM y volver
// desmonta la página y pierde todo lo que no se haya guardado como propuesta.
const WORKSPACE_KEY = 'presupuestador-workspace'

interface PersistedWorkspace {
  lead: LeadResult | null
  mensajes: ChatMessage[]
  log: { role: 'user' | 'assistant'; text: string }[]
  draft: Draft | null
  savedUrl: string | null
  savedId: string | null
  reunion: ReunionEncontrada | null
  reunionChecked: boolean
  previewTab: 'resumen' | 'detallada'
}

function loadWorkspace(): Partial<PersistedWorkspace> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(WORKSPACE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export default function PresupuestadorPage() {
  const [persisted] = useState(loadWorkspace)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LeadResult[]>([])
  const [searching, setSearching] = useState(false)
  const [lead, setLead] = useState<LeadResult | null>(persisted.lead ?? null)

  const [mensajes, setMensajes] = useState<ChatMessage[]>(persisted.mensajes ?? [])
  const [log, setLog] = useState<{ role: 'user' | 'assistant'; text: string }[]>(persisted.log ?? [])
  const [draft, setDraft] = useState<Draft | null>(persisted.draft ?? null)
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState('')
  const [savedUrl, setSavedUrl] = useState<string | null>(persisted.savedUrl ?? null)
  const [savedId, setSavedId] = useState<string | null>(persisted.savedId ?? null)
  const [saving, setSaving] = useState(false)
  const [reunion, setReunion] = useState<ReunionEncontrada | null>(persisted.reunion ?? null)
  const [reunionChecked, setReunionChecked] = useState(persisted.reunionChecked ?? false)
  const [previewTab, setPreviewTab] = useState<'resumen' | 'detallada'>(persisted.previewTab ?? 'resumen')
  const [recientes, setRecientes] = useState<RecentPropuesta[]>([])
  const [loadingRecientes, setLoadingRecientes] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (!lead) {
        sessionStorage.removeItem(WORKSPACE_KEY)
        return
      }
      const workspace: PersistedWorkspace = { lead, mensajes, log, draft, savedUrl, savedId, reunion, reunionChecked, previewTab }
      sessionStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace))
    } catch {
      // sessionStorage puede fallar (privado, cuota) -- no es crítico, se pierde la persistencia nomás.
    }
  }, [lead, mensajes, log, draft, savedUrl, savedId, reunion, reunionChecked, previewTab])

  function fetchRecientes() {
    fetch('/api/propuestas/recientes')
      .then((r) => r.json())
      .then((json) => setRecientes(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingRecientes(false))
  }

  useEffect(() => { fetchRecientes() }, [])

  const logEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log, loading])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/leads/search?q=${encodeURIComponent(query)}&limit=8`)
        const json = await res.json()
        setResults(json.data ?? [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  async function sendToAgent(newMensajes: ChatMessage[], modo: 'resumen' | 'propuesta', leadOverride?: LeadResult) {
    const activeLead = leadOverride ?? lead
    if (!activeLead) return
    setLoading(true)
    try {
      const res = await fetch('/api/propuestas/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: activeLead.id, mensajes: newMensajes, modo }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      const { mensaje_agente, propuesta } = json.data as { mensaje_agente: string; propuesta: Draft | null }
      if (propuesta) setDraft(propuesta)
      setReunion(json.reunion_encontrada ?? null)
      setReunionChecked(true)
      setLog((l) => [...l, { role: 'assistant', text: mensaje_agente }])
      setMensajes([...newMensajes, { role: 'assistant', content: mensaje_agente }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error generando la propuesta'
      toast.error(msg)
      // Además del toast (que se pierde solo), queda visible en el chat —
      // si no, un error se ve exactamente igual que "no pasó nada".
      setLog((l) => [...l, { role: 'assistant', text: `⚠️ ${msg}` }])
    } finally {
      setLoading(false)
    }
  }

  // Limpia todo lo que no sea el lead en sí — usado antes de elegir/cargar
  // uno nuevo y desde "Cambiar lead", para que nunca quede un resabio de la
  // propuesta anterior (borrador, link guardado, chat, reunión detectada).
  function resetWorkspace() {
    setQuery('')
    setResults([])
    setDraft(null)
    setLog([])
    setMensajes([])
    setInput('')
    setSavedUrl(null)
    setSavedId(null)
    setReunion(null)
    setReunionChecked(false)
    setPreviewTab('resumen')
    if (typeof window !== 'undefined') sessionStorage.removeItem(WORKSPACE_KEY)
  }

  function handleSelectLead(l: LeadResult) {
    resetWorkspace()
    setLead(l)
    const inicial: ChatMessage[] = [{ role: 'user', content: 'Contame qué encontraste sobre este lead antes de armar la propuesta.' }]
    setMensajes(inicial)
    void sendToAgent(inicial, 'resumen', l)
  }

  function handleLoadRecent(p: RecentPropuesta) {
    const leadData = Array.isArray(p.lead) ? p.lead[0] : p.lead
    if (!leadData) return
    resetWorkspace()
    setLead(leadData)
    setDraft(p.contenido)
    setSavedUrl(`/propuesta/${p.id}`)
    setSavedId(p.id)
  }

  function handleChangeLead() {
    resetWorkspace()
    setLead(null)
    fetchRecientes()
  }

  function handleSend() {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')
    setLog((l) => [...l, { role: 'user', text }])
    // Sin borrador todavía: el mensaje suma/corrige contexto (modo resumen),
    // no dispara la generación completa por sí solo — eso es handleGenerar.
    // Con borrador ya armado, cada mensaje es un pedido de cambio (propuesta).
    void sendToAgent([...mensajes, { role: 'user', content: text }], draft ? 'propuesta' : 'resumen')
  }

  function handleGenerar() {
    if (loading) return
    const text = 'Dale, generá la propuesta con la info que tenés hasta ahora.'
    setLog((l) => [...l, { role: 'user', text }])
    void sendToAgent([...mensajes, { role: 'user', content: text }], 'propuesta')
  }

  async function handleGuardar() {
    if (!lead || !draft) return
    setSaving(true)
    try {
      const { moneda, monto } = draft.detallada.inversion
      const createRes = await fetch(`/api/leads/${lead.id}/propuestas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descripcion: draft.detallada.titulo,
          moneda,
          valor_usd: moneda === 'USD' ? monto : null,
          valor_ars: moneda === 'ARS' ? monto : null,
          contenido: draft,
        }),
      })
      const createJson = await createRes.json()
      if (!createRes.ok) throw new Error(createJson.error || 'Error al guardar')

      const propuestaId = createJson.data.id as string
      // El link (con slug legible) ya viene armado desde el POST -- no hace
      // falta un PATCH aparte.
      const link = createJson.data.link as string

      setSavedUrl(link)
      setSavedId(propuestaId)
      setRecientes((r) => [{ id: propuestaId, descripcion: draft.detallada.titulo, contenido: draft, created_at: new Date().toISOString(), lead }, ...r])
      toast.success('Propuesta guardada')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-1 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <Sparkles size={22} className="text-blue-500" /> Presupuestador
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Agente con IA que arma una propuesta lista para enviar, a partir de un lead real</p>
      </div>

      {!lead ? (
        <div className="max-w-lg mx-auto mt-16 w-full">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscá un lead por nombre o empresa..."
              className="w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {searching && <p className="text-xs text-slate-400 mt-2 px-1">Buscando...</p>}
          {results.length > 0 && (
            <div className="mt-2 bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-50">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelectLead(r)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-800">{r.nombre} {r.apellido || ''}</p>
                  {r.empresa && <p className="text-xs text-slate-500">{r.empresa}</p>}
                </button>
              ))}
            </div>
          )}

          {!query && (
            <div className="mt-8">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-1">Propuestas recientes</p>
              {loadingRecientes ? (
                <p className="text-xs text-slate-400 px-1">Cargando...</p>
              ) : recientes.length === 0 ? (
                <p className="text-xs text-slate-400 px-1">Todavía no generaste ninguna.</p>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-50">
                  {recientes.map((p) => {
                    const l = Array.isArray(p.lead) ? p.lead[0] : p.lead
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleLoadRecent(p)}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{p.descripcion}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {l ? [l.nombre, l.apellido].filter(Boolean).join(' ') : 'Lead eliminado'}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {new Date(p.created_at).toLocaleDateString('es-AR')}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
          {/* Chat */}
          <div className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden min-h-0">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">{lead.nombre} {lead.apellido || ''}</p>
                {lead.empresa && <p className="text-xs text-slate-500">{lead.empresa}</p>}
              </div>
              <button onClick={handleChangeLead} className="text-xs text-slate-400 hover:text-slate-600">
                Cambiar lead
              </button>
            </div>

            {reunionChecked && (
              <div className={cn(
                'mx-4 mt-3 px-3 py-2 rounded-lg text-xs',
                !reunion ? 'bg-slate-50 text-slate-500' :
                reunion.coincideConFechaReunion === false ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
              )}>
                {!reunion ? (
                  'No encontramos notas ni transcripción de reunión para este lead en Drive.'
                ) : (
                  <>
                    <p className="font-medium">
                      {reunion.coincideConFechaReunion === false && '⚠️ '}
                      Reunión usada como contexto:
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {reunion.archivos.map((a, i) => (
                        <li key={i}>
                          <a href={a.url} target="_blank" rel="noreferrer" className="underline">{a.nombre}</a>
                          {a.fecha && ` — ${new Date(a.fecha).toLocaleDateString('es-AR')}`}
                        </li>
                      ))}
                    </ul>
                    {reunion.coincideConFechaReunion === false && (
                      <p className="mt-1">La fecha no coincide con la reunión registrada en la ficha — confirmá que es el lead correcto.</p>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {log.map((m, i) => (
                <div key={i} className={cn('max-w-[85%] px-3.5 py-2.5 rounded-xl text-sm', m.role === 'user' ? 'ml-auto bg-blue-600 text-white' : 'bg-slate-100 text-slate-700')}>
                  {m.text}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 size={13} className="animate-spin" /> Pensando la propuesta...
                </div>
              )}
              <div ref={logEndRef} />
            </div>

            <div className="p-3 border-t border-slate-100 space-y-2">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                  placeholder={draft ? 'Pedile cambios: bajá el precio, sacá tal cosa, agregá...' : 'Confirmá, corregí o agregá info sobre el proyecto...'}
                  disabled={loading}
                  className="flex-1 px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="px-3.5 py-2.5 rounded-lg bg-blue-600 text-white disabled:opacity-40 hover:bg-blue-700 transition-colors"
                >
                  <Send size={15} />
                </button>
              </div>
              {!draft && (
                <button
                  onClick={handleGenerar}
                  disabled={loading || mensajes.length === 0}
                  className="w-full text-xs font-medium px-3 py-2 rounded-lg bg-slate-800 text-white disabled:opacity-40 hover:bg-slate-900 transition-colors"
                >
                  Generar propuesta →
                </button>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="flex flex-col bg-slate-100 border border-slate-200 rounded-xl overflow-hidden min-h-0">
            <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between flex-shrink-0 gap-2">
              {draft ? (
                <div className="inline-flex bg-slate-100 rounded-full p-0.5 text-xs">
                  <button
                    onClick={() => setPreviewTab('resumen')}
                    className={cn('px-2.5 py-1 rounded-full transition-colors', previewTab === 'resumen' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500')}
                  >
                    Resumen
                  </button>
                  <button
                    onClick={() => setPreviewTab('detallada')}
                    className={cn('px-2.5 py-1 rounded-full transition-colors', previewTab === 'detallada' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500')}
                  >
                    Completa
                  </button>
                </div>
              ) : (
                <p className="text-sm font-semibold text-slate-800">Vista previa</p>
              )}
              {draft && (
                savedUrl ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${savedUrl}`); toast.success('Link copiado') }}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600"
                    >
                      <Copy size={12} /> Copiar link
                    </button>
                    <a
                      href={savedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700"
                    >
                      <ExternalLink size={12} /> Abrir
                    </a>
                  </div>
                ) : (
                  <button
                    onClick={handleGuardar}
                    disabled={saving}
                    className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Guardando...' : 'Guardar y generar link'}
                  </button>
                )
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {draft ? (
                previewTab === 'resumen' && draft.resumen ? (
                  <PropuestaResumenDocument contenido={draft.resumen} propuestaId={savedId ?? undefined} />
                ) : (
                  <PropuestaDocument contenido={draft.detallada} propuestaId={savedId ?? undefined} />
                )
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-slate-400">
                  {loading ? 'Generando el primer borrador...' : 'Sin propuesta todavía'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
