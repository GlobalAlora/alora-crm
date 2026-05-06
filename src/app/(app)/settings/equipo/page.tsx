'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Check, X, UserCog } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type { TeamMember } from '@/types'

const ROLES = ['dev', 'lider_tecnico', 'pm', 'diseño', 'qa', 'otro']
const ROLE_LABELS: Record<string, string> = {
  dev: 'Desarrollador',
  lider_tecnico: 'Líder técnico',
  pm: 'Project Manager',
  diseño: 'Diseño',
  qa: 'QA',
  otro: 'Otro',
}

function rolLabel(role: string) {
  return ROLE_LABELS[role] ?? role
}

const API = '/api/team-members'
const fetch_ = (url: string, opts?: RequestInit) =>
  fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(r => r.json())

export default function EquipoPage() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['team-members'] })

  const { data, isLoading } = useQuery<{ data: TeamMember[] }>({
    queryKey: ['team-members'],
    queryFn: () => fetch_(API),
  })
  const members = data?.data ?? []

  // Create
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('dev')
  const [newEmail, setNewEmail] = useState('')

  const createMutation = useMutation({
    mutationFn: (body: object) => fetch_(API, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidate()
      setShowNew(false)
      setNewName('')
      setNewRole('dev')
      setNewEmail('')
      toast.success('Miembro creado')
    },
    onError: () => toast.error('Error al crear'),
  })

  // Edit
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editEmail, setEditEmail] = useState('')

  const startEdit = (m: TeamMember) => {
    setEditId(m.id)
    setEditName(m.full_name)
    setEditRole(m.role)
    setEditEmail(m.email ?? '')
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) =>
      fetch_(`${API}/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); setEditId(null); toast.success('Guardado') },
    onError: () => toast.error('Error al guardar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch_(`${API}/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); toast.success('Eliminado') },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <UserCog size={20} className="text-slate-500" /> Equipo
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Miembros del equipo técnico asignables a proyectos. No requieren acceso al sistema.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} /> Agregar
        </button>
      </div>

      {/* New member form */}
      {showNew && (
        <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
          <h3 className="text-sm font-medium text-slate-700">Nuevo miembro</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Nombre *</label>
              <input
                autoFocus
                type="text"
                placeholder="Ej: Juan García"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newName.trim() && createMutation.mutate({ full_name: newName, role: newRole, email: newEmail || undefined })}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Rol</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ROLES.map(r => <option key={r} value={r}>{rolLabel(r)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Email (opcional)</label>
            <input
              type="email"
              placeholder="juan@empresa.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowNew(false); setNewName('') }}
              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => createMutation.mutate({ full_name: newName, role: newRole, email: newEmail || undefined })}
              disabled={!newName.trim() || createMutation.isPending}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Crear
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <UserCog size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay miembros del equipo todavía.</p>
          <p className="text-xs mt-1">Agregá devs, líderes técnicos y PMs para asignarlos a proyectos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="bg-white border rounded-xl px-4 py-3">
              {editId === m.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{rolLabel(r)}</option>)}
                    </select>
                  </div>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Email (opcional)"
                    className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditId(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors">
                      <X size={15} />
                    </button>
                    <button
                      onClick={() => updateMutation.mutate({ id: m.id, body: { full_name: editName, role: editRole, email: editEmail || null } })}
                      disabled={!editName.trim() || updateMutation.isPending}
                      className="p-1.5 text-green-600 hover:text-green-700 rounded transition-colors disabled:opacity-50"
                    >
                      <Check size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0',
                      m.role === 'lider_tecnico' ? 'bg-purple-500' :
                      m.role === 'dev' ? 'bg-blue-500' :
                      m.role === 'pm' ? 'bg-amber-500' :
                      m.role === 'diseño' ? 'bg-pink-500' :
                      m.role === 'qa' ? 'bg-green-500' : 'bg-slate-400'
                    )}>
                      {m.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{m.full_name}</p>
                      <p className="text-xs text-slate-500">{rolLabel(m.role)}{m.email ? ` · ${m.email}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(m)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar a ${m.full_name}?`)) deleteMutation.mutate(m.id)
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
