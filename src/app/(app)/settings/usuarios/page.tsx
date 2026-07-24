'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Trash2, Shield, Eye, Briefcase, Check, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── types ────────────────────────────────────────────────
interface CrmUser {
  id:           string
  email:        string
  full_name:    string
  avatar_url:   string | null
  role:         string | null
  in_crm:       boolean
  last_sign_in: string | null
  created_at:   string
}

const ROLE_CONFIG: Record<string, { label: string; desc: string; icon: React.ElementType; color: string }> = {
  admin:   { label: 'Admin',    desc: 'Acceso completo al CRM',       icon: Shield,   color: 'text-purple-700 bg-purple-50 border-purple-200' },
  sales:   { label: 'Sales',   desc: 'Acceso completo al CRM',       icon: Briefcase, color: 'text-blue-700   bg-blue-50   border-blue-200'   },
  viewer:  { label: 'Viewer',  desc: 'Solo puede ver sus proyectos', icon: Eye,       color: 'text-slate-600  bg-slate-50  border-slate-200'  },
}

// ─── API helpers ──────────────────────────────────────────
async function fetchUsers(): Promise<{ data: CrmUser[] }> {
  const r = await fetch('/api/admin/users')
  if (!r.ok) throw new Error((await r.json()).error ?? 'Error')
  return r.json()
}

async function inviteUser(body: { email: string; full_name: string; role: string }) {
  const r = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? 'Error al invitar')
  return j
}

async function updateUserRole(id: string, role: string) {
  const r = await fetch(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? 'Error')
}

async function deleteUser(id: string) {
  const r = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error ?? 'Error')
}

// ─── Page ─────────────────────────────────────────────────
export default function UsuariosPage() {
  const router   = useRouter()
  const qc       = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn:  fetchUsers,
    retry:    false,
  })

  // Redirect if not admin (API returns 403)
  if (error) {
    router.push('/projects')
    return null
  }

  const invite = useMutation({
    mutationFn: inviteUser,
    onSuccess:  () => { toast.success('Invitación enviada'); qc.invalidateQueries({ queryKey: ['admin-users'] }); setShowModal(false) },
    onError:    (e: Error) => toast.error(e.message),
  })

  const patchRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => updateUserRole(id, role),
    onMutate:   async ({ id, role }) => {
      await qc.cancelQueries({ queryKey: ['admin-users'] })
      const prev = qc.getQueryData<{ data: CrmUser[] }>(['admin-users'])
      qc.setQueryData(['admin-users'], (old: { data: CrmUser[] } | undefined) => old
        ? { ...old, data: old.data.map(u => u.id === id ? { ...u, role } : u) }
        : old)
      return { prev }
    },
    onError:    (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['admin-users'], ctx.prev); toast.error('Error al actualizar rol') },
    onSettled:  () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const remove = useMutation({
    mutationFn: deleteUser,
    onSuccess:  () => { toast.success('Usuario eliminado'); qc.invalidateQueries({ queryKey: ['admin-users'] }) },
    onError:    (e: Error) => toast.error(e.message),
  })

  const users = data?.data ?? []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Usuarios y permisos</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestión de accesos al CRM</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <UserPlus size={15} />
          Invitar usuario
        </button>
      </div>

      {/* Role legend */}
      <div className="px-6 py-3 bg-slate-50 border-b flex items-center gap-4 flex-wrap">
        {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon
          return (
            <div key={key} className="flex items-center gap-1.5 text-xs text-slate-600">
              <Icon size={12} className="text-slate-400" />
              <span className="font-medium">{cfg.label}:</span>
              <span className="text-slate-500">{cfg.desc}</span>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Usuario</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Email</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Rol</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Último acceso</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const roleCfg = ROLE_CONFIG[user.role ?? '']
                  const RoleIcon = roleCfg?.icon ?? Eye
                  return (
                    <tr key={user.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      {/* Name + avatar */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {user.avatar_url ? (
                            <img src={user.avatar_url} className="w-8 h-8 rounded-full object-cover" alt={user.full_name} />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
                              {user.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium text-slate-800">{user.full_name}</span>
                          {!user.in_crm && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Pendiente</span>
                          )}
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 text-slate-500">{user.email}</td>

                      {/* Role selector */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <RoleIcon size={13} className="text-slate-400 flex-shrink-0" />
                          <select
                            value={user.role ?? ''}
                            onChange={e => {
                              if (e.target.value) patchRole.mutate({ id: user.id, role: e.target.value })
                            }}
                            className={cn(
                              'text-xs font-medium border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer',
                              roleCfg?.color ?? 'border-slate-200 bg-white text-slate-600'
                            )}
                          >
                            {!user.role && <option value="">Sin rol</option>}
                            <option value="admin">Admin</option>
                            <option value="sales">Sales</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </div>
                      </td>

                      {/* Last sign in */}
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {user.last_sign_in
                          ? format(new Date(user.last_sign_in), "d MMM yyyy 'a las' HH:mm", { locale: es })
                          : 'Nunca'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar a ${user.full_name}? Perderá acceso inmediatamente.`)) {
                              remove.mutate(user.id)
                            }
                          }}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Eliminar usuario"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-sm">
                      No hay usuarios registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showModal && (
        <InviteModal
          onClose={() => setShowModal(false)}
          onSubmit={(data) => invite.mutate(data)}
          isLoading={invite.isPending}
        />
      )}
    </div>
  )
}

// ─── InviteModal ──────────────────────────────────────────
function InviteModal({
  onClose, onSubmit, isLoading,
}: {
  onClose: () => void
  onSubmit: (data: { email: string; full_name: string; role: string }) => void
  isLoading: boolean
}) {
  const [form, setForm] = useState({ email: '', full_name: '', role: 'viewer' })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.email.trim() || !form.full_name.trim()) return
    onSubmit(form)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b">
          <h2 className="text-base font-semibold text-slate-900">Invitar nuevo usuario</h2>
          <p className="text-sm text-slate-500 mt-0.5">Le llegará un email para crear su contraseña</p>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Nombre completo</label>
            <input
              type="text"
              required
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Juan García"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="juan@empresa.com"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Rol</label>
            <div className="space-y-2">
              {Object.entries(ROLE_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon
                const selected = form.role === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, role: key }))}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
                      selected ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <Icon size={14} className={selected ? 'text-blue-600' : 'text-slate-400'} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{cfg.label}</p>
                      <p className="text-xs text-slate-500">{cfg.desc}</p>
                    </div>
                    {selected && <Check size={14} className="text-blue-600 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !form.email.trim() || !form.full_name.trim()}
              className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              Enviar invitación
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
