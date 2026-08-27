'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Trash2, Pencil, Check, X, Loader2, ExternalLink, Clock, Palette, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { extraHourPrice, formatARS } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────

interface PortalClientRow {
  id:                  string
  email:               string
  nombre:              string
  empresa:             string | null
  plan_horas_mensual:  number
  created_at:          string
  tickets_abiertos:    number
  tickets_total:       number
  horas_mes:           number
  horas_pendientes:    number
  horas_extra:         number
  horas_extra_total:   number
  color_acento:        string | null
  nombre_plan:         string | null
  mensaje_bienvenida:  string | null
  logo_url:            string | null
  manager_nombre:      string | null
  manager_avatar:      string | null
  project_id:          string | null
}

interface ProjectOption {
  id:     string
  nombre: string
}

interface CrmUserOption {
  id:         string
  full_name:  string
  avatar_url: string | null
}

// ─── API helpers ─────────────────────────────────────────

async function fetchClients(): Promise<{ data: PortalClientRow[] }> {
  const r = await fetch('/api/admin/portal-clients')
  if (!r.ok) throw new Error((await r.json()).error ?? 'Error')
  return r.json()
}

async function createClient(body: { nombre: string; empresa: string; email: string; password: string; plan_horas_mensual: number }) {
  const r = await fetch('/api/admin/portal-clients', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? 'Error al crear')
  return j
}

async function patchClient(id: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/admin/portal-clients/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? 'Error al actualizar')
  return j
}

async function deleteClient(id: string) {
  const r = await fetch(`/api/admin/portal-clients/${id}`, { method: 'DELETE' })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? 'Error al eliminar')
}

// ─── Hours bar ───────────────────────────────────────────

function HoursBar({ consumed, plan, extra, pending }: { consumed: number; plan: number; extra: number; pending: number }) {
  const pct   = plan > 0 ? Math.min(100, Math.round((consumed / plan) * 100)) : 0
  const color = pct < 70 ? '#3b82f6' : pct < 90 ? '#f59e0b' : '#ef4444'
  const fmt   = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(1)
  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 99, transition: 'width .3s' }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
          {fmt(consumed)}/{plan}h
        </span>
      </div>
      {extra > 0 && (
        <span className="text-xs font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
          +{fmt(extra)} hs confirmadas
        </span>
      )}
      {pending > 0 && (
        <span className="text-xs font-semibold text-orange-500 dark:text-orange-400 whitespace-nowrap">
          +{fmt(pending)} hs pendientes
        </span>
      )}
    </div>
  )
}

// ─── Inline editable plan field ──────────────────────────

function EditablePlan({ client, onSave }: { client: PortalClientRow; onSave: (id: string, val: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(String(client.plan_horas_mensual))

  function commit() {
    const n = Number(val)
    if (!isNaN(n) && n > 0 && n !== client.plan_horas_mensual) onSave(client.id, n)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="number"
          min="1"
          step="1"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          onBlur={commit}
          className="w-16 px-2 py-0.5 text-sm rounded border border-blue-400 bg-background text-foreground focus:outline-none"
        />
        <span className="text-xs text-muted-foreground">hs</span>
      </div>
    )
  }

  return (
    <button
      onClick={() => { setVal(String(client.plan_horas_mensual)); setEditing(true) }}
      className="flex items-center gap-1.5 text-sm text-foreground hover:text-blue-500 transition-colors group"
    >
      {client.plan_horas_mensual} hs
      <Pencil size={11} className="opacity-0 group-hover:opacity-50 transition-opacity" />
    </button>
  )
}

// ─── Personalize Modal ───────────────────────────────────

function PersonalizeModal({
  client,
  onClose,
  onSaved,
}: {
  client: PortalClientRow
  onClose: () => void
  onSaved: (updated: Partial<PortalClientRow>) => void
}) {
  const [color,          setColor]          = useState(client.color_acento ?? '#0f172a')
  const [nombrePlan,     setNombrePlan]     = useState(client.nombre_plan ?? '')
  const [planHoras,      setPlanHoras]      = useState(client.plan_horas_mensual)
  const [mensaje,        setMensaje]        = useState(client.mensaje_bienvenida ?? '')
  const [logoUrl,        setLogoUrl]        = useState(client.logo_url ?? '')
  const [managerNombre,  setManagerNombre]  = useState(client.manager_nombre ?? '')
  const [managerAvatar,  setManagerAvatar]  = useState(client.manager_avatar ?? '')
  const [projectId,      setProjectId]      = useState(client.project_id ?? '')
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState('')
  const [userPickerOpen, setUserPickerOpen] = useState(false)

  const { data: projectsData } = useQuery<{ data: ProjectOption[] }>({
    queryKey: ['projects-list'],
    queryFn:  () => fetch('/api/projects?limit=100').then(r => r.json()),
    staleTime: 60_000,
  })
  const projects = projectsData?.data ?? []

  const { data: usersData } = useQuery<{ data: CrmUserOption[] }>({
    queryKey: ['admin-users'],
    queryFn:  () => fetch('/api/admin/users').then(r => r.json()),
    staleTime: 60_000,
  })
  const crmUsers = (usersData?.data ?? []).filter(u => u.full_name)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await patchClient(client.id, {
        color_acento:       color,
        nombre_plan:        nombrePlan.trim() || null,
        plan_horas_mensual: planHoras,
        mensaje_bienvenida: mensaje.trim() || null,
        logo_url:           logoUrl.trim() || null,
        manager_nombre:     managerNombre.trim() || null,
        manager_avatar:     managerAvatar.trim() || null,
        project_id:         projectId || null,
      })
      onSaved({
        color_acento:       color,
        nombre_plan:        nombrePlan.trim() || null,
        plan_horas_mensual: planHoras,
        mensaje_bienvenida: mensaje.trim() || null,
        logo_url:           logoUrl.trim() || null,
        manager_nombre:     managerNombre.trim() || null,
        manager_avatar:     managerAvatar.trim() || null,
        project_id:         projectId || null,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-card-border rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">Personalizar dashboard</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{client.nombre}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Preview */}
        <div style={{ background: color, borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="logo" style={{ height: 24, objectFit: 'contain', maxWidth: 80 }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <img src="/logo-nav-white.png" alt="Alora" style={{ height: 24, objectFit: 'contain' }} />
          )}
          <div>
            <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: 0 }}>{client.nombre}</p>
            {client.empresa && <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, margin: 0 }}>{client.empresa}</p>}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>preview</span>
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Color de acento</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-card-border cursor-pointer p-0.5 bg-transparent"
              />
              <input
                type="text"
                value={color}
                onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setColor(e.target.value) }}
                className="flex-1 px-3 py-2 rounded-lg bg-muted border border-card-border text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Plan */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Plan</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {[
                { label: 'Plan Básico', horas: 0, sub: 'Solo mantenimiento' },
                { label: 'Plan Premium', horas: 5, sub: 'Bolsa de 5 hs/mes' },
              ].map(p => {
                const active = planHoras === p.horas && (nombrePlan === p.label || nombrePlan === '')
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { setPlanHoras(p.horas); setNombrePlan(p.label) }}
                    className={`px-3 py-2.5 rounded-lg border text-left transition-all ${
                      active
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                        : 'border-card-border bg-muted hover:border-blue-300'
                    }`}
                  >
                    <p className={`text-xs font-semibold ${active ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'}`}>{p.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{p.sub}</p>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={nombrePlan}
                onChange={e => setNombrePlan(e.target.value)}
                placeholder="Nombre del plan (opcional)"
                className="flex-1 px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted border border-card-border">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={planHoras}
                  onChange={e => setPlanHoras(Number(e.target.value))}
                  className="w-10 bg-transparent text-sm text-foreground text-center focus:outline-none"
                />
                <span className="text-xs text-muted-foreground">hs/mes</span>
              </div>
            </div>
          </div>

          {/* Welcome message */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Mensaje de bienvenida</label>
            <textarea
              value={mensaje}
              onChange={e => setMensaje(e.target.value)}
              placeholder="¡Hola! Cualquier consulta estamos a disposición."
              rows={2}
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            {mensaje.length > 150 && (
              <p className="text-xs text-muted-foreground mt-0.5 text-right">{mensaje.length}/200</p>
            )}
          </div>

          {/* Logo URL */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">URL del logo (opcional)</label>
            <input
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://empresa.com/logo-blanco.png"
              className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-muted-foreground mt-1">Recomendado: logo en blanco o claro, formato PNG con fondo transparente.</p>
          </div>

          {/* Project */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Proyecto vinculado</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Sin proyecto</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">Los tickets del portal se asignan automáticamente a este proyecto.</p>
          </div>

          {/* Manager */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Responsable Alora</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserPickerOpen(v => !v)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground hover:border-blue-400 transition-colors"
              >
                {managerNombre ? (
                  <>
                    {managerAvatar ? (
                      <img src={managerAvatar} alt={managerNombre} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                        {managerNombre[0].toUpperCase()}
                      </div>
                    )}
                    <span className="flex-1 text-left">{managerNombre}</span>
                  </>
                ) : (
                  <span className="flex-1 text-left text-muted-foreground">Sin responsable</span>
                )}
                <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
              </button>

              {userPickerOpen && (
                <div className="absolute z-20 mt-1 w-full bg-card border border-card-border rounded-xl shadow-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setManagerNombre(''); setManagerAvatar(''); setUserPickerOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
                    Sin responsable
                  </button>
                  {crmUsers.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setManagerNombre(u.full_name); setManagerAvatar(u.avatar_url ?? ''); setUserPickerOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.full_name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0">
                          {u.full_name[0].toUpperCase()}
                        </div>
                      )}
                      {u.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-card-border text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium disabled:opacity-50">
              {loading ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Check size={14} /> Guardar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Create Modal ────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: PortalClientRow) => void }) {
  const [nombre,   setNombre]   = useState('')
  const [empresa,  setEmpresa]  = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [plan,     setPlan]     = useState('20')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const j = await createClient({ nombre, empresa, email, password, plan_horas_mensual: Number(plan) || 20 })
      onCreated(j.data)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al crear')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-card border border-card-border rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">Nuevo cliente del portal</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Nombre *</label>
              <input required value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Juan García"
                className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Empresa</label>
              <input value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Mi Empresa S.A."
                className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Email *</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@empresa.com"
              className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Contraseña inicial *</label>
              <input required type="text" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Mín. 8 caracteres"
                className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {password.length > 0 && password.length < 8 && (
                <p className="text-xs text-orange-500 mt-1">Mínimo 8 caracteres</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Plan (hs/mes)</label>
              <input type="number" min="1" value={plan} onChange={e => setPlan(e.target.value)} placeholder="20"
                className="w-full px-3 py-2 rounded-lg bg-muted border border-card-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-card-border text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading || password.length < 8}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium disabled:opacity-50">
              {loading ? <><Loader2 size={14} className="animate-spin" /> Creando...</> : <><Check size={14} /> Crear cliente</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────

export default function PortalClientesPage() {
  const router = useRouter()
  const qc     = useQueryClient()
  const [showModal,       setShowModal]       = useState(false)
  const [deletingId,      setDeletingId]      = useState<string | null>(null)
  const [personalizingId, setPersonalizingId] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-portal-clients'],
    queryFn:  fetchClients,
    retry:    false,
  })

  const updatePlan = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: number }) => patchClient(id, { plan_horas_mensual: plan }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-portal-clients'] })
      toast.success('Plan actualizado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-portal-clients'] })
      toast.success('Cliente eliminado')
      setDeletingId(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const clients = data?.data ?? []
  const personalizingClient = clients.find(c => c.id === personalizingId) ?? null

  if (error) {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-10">
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-red-700 dark:text-red-300 mb-2">Error al cargar clientes del portal</h2>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">
            {error instanceof Error ? error.message : 'Error desconocido'}
          </p>
          <p className="text-xs text-muted-foreground">
            Si la tabla <code className="bg-muted px-1 rounded">portal_clients</code> no existe, ejecutá el SQL de migración en Supabase primero.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Clientes del portal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestioná las cuentas de acceso a ticket.globalalora.com
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <UserPlus size={15} /> Nuevo cliente
        </button>
      </div>

      {/* Overage alert */}
      {clients.filter(c => c.horas_extra_total > 0).length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl p-4">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-3">
            ⚠️ Clientes con horas excedidas este mes — pendiente de facturación
          </p>
          <div className="flex flex-col gap-2">
            {clients.filter(c => c.horas_extra_total > 0).map(c => {
              const price       = extraHourPrice()
              const fmt         = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(1)
              const confirmedARS = Math.round(c.horas_extra * price)
              const pendingARS   = Math.round(c.horas_pendientes * price)
              return (
                <div key={c.id} className="bg-white dark:bg-red-950/60 border border-red-100 dark:border-red-800 rounded-xl px-4 py-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="font-semibold text-foreground text-sm">{c.nombre}</span>
                      {c.empresa && <span className="text-xs text-muted-foreground ml-2">{c.empresa}</span>}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-foreground text-base tabular-nums">
                        ${formatARS(confirmedARS)} a facturar
                      </p>
                      {c.horas_pendientes > 0 && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 tabular-nums">
                          +${formatARS(pendingARS)} si aprueban las {fmt(c.horas_pendientes)} hs pendientes
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Plan: {c.plan_horas_mensual} hs</span>
                    <span>·</span>
                    <span>Consumidas: <strong className="text-foreground">{fmt(c.horas_mes)} hs</strong></span>
                    <span>·</span>
                    <span className="text-red-600 dark:text-red-400 font-semibold">+{fmt(c.horas_extra)} hs confirmadas</span>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Precio hora extra: ${formatARS(extraHourPrice())} / hs (ajuste trimestral)
          </p>
        </div>
      )}

      {/* Table card */}
      <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Cargando...</span>
          </div>
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Clock size={32} className="opacity-30" />
            <p className="text-sm">No hay clientes registrados aún</p>
            <button onClick={() => setShowModal(true)} className="text-sm text-blue-500 hover:underline">
              Crear el primero
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border bg-muted/40">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plan</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Horas este mes</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tickets</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Registro</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {clients.map(c => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {c.color_acento && (
                          <span
                            style={{ width: 8, height: 8, borderRadius: '50%', background: c.color_acento, flexShrink: 0 }}
                            title={c.nombre_plan ?? undefined}
                          />
                        )}
                        <div>
                          <p className="font-medium text-foreground">{c.nombre}</p>
                          {c.empresa && <p className="text-xs text-muted-foreground">{c.empresa}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-muted-foreground">{c.email}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <EditablePlan client={c} onSave={(id, plan) => updatePlan.mutate({ id, plan })} />
                    </td>
                    <td className="px-5 py-3.5">
                      <HoursBar consumed={c.horas_mes} plan={c.plan_horas_mensual} extra={c.horas_extra} pending={c.horas_pendientes} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {c.tickets_abiertos > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                            {c.tickets_abiertos} abierto{c.tickets_abiertos !== 1 ? 's' : ''}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{c.tickets_total} total</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(c.created_at), "d MMM yyyy", { locale: es })}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/admin/portal-clients/${c.id}/impersonate`, { method: 'POST' })
                            const { url } = await res.json()
                            if (url) window.open(url, '_blank')
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Ver portal del cliente"
                        >
                          <ExternalLink size={14} />
                        </button>
                        <button
                          onClick={() => setPersonalizingId(c.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Personalizar dashboard"
                        >
                          <Palette size={14} />
                        </button>
                        {deletingId === c.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => remove.mutate(c.id)}
                              disabled={remove.isPending}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                              title="Confirmar eliminación"
                            >
                              {remove.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingId(c.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                            title="Eliminar cliente"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        El plan de horas se edita haciendo click en el número. Las sesiones expiradas se limpian automáticamente cada noche.
      </p>

      {showModal && (
        <CreateModal
          onClose={() => setShowModal(false)}
          onCreated={(c) => {
            qc.setQueryData(['admin-portal-clients'], (old: { data: PortalClientRow[] } | undefined) =>
              old ? { data: [c, ...old.data] } : { data: [c] }
            )
            toast.success(`Cliente ${c.nombre} creado`)
          }}
        />
      )}

      {personalizingClient && (
        <PersonalizeModal
          client={personalizingClient}
          onClose={() => setPersonalizingId(null)}
          onSaved={(updated) => {
            qc.setQueryData(['admin-portal-clients'], (old: { data: PortalClientRow[] } | undefined) =>
              old ? { data: old.data.map(c => c.id === personalizingClient.id ? { ...c, ...updated } : c) } : old
            )
            toast.success('Personalización guardada')
          }}
        />
      )}
    </div>
  )
}
