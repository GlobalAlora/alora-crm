'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Plus, FileCode2, TrendingUp, Users, Zap, MoreHorizontal, Pencil, Trash2, ToggleLeft, ToggleRight, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { formsApi } from '@/lib/api'
import type { FormWithStats } from '@/lib/api'
import { cn } from '@/lib/utils'

export default function FormsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ['forms'],
    queryFn: () => formsApi.list(),
    staleTime: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: (name: string) => formsApi.create({ name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['forms'] })
      toast.success('Formulario creado')
      router.push(`/settings/forms/${res.id}`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      formsApi.update(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['forms'] }),
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => formsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] })
      toast.success('Formulario desactivado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    createMutation.mutate(newName.trim())
  }

  const copySnippet = (formId: string) => {
    const origin = window.location.origin
    const snippet = `<script src="${origin}/embed.js" data-form-id="${formId}"></script>`
    navigator.clipboard.writeText(snippet).then(() => {
      setCopiedId(formId)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Formularios</h1>
          <p className="text-sm text-slate-500 mt-0.5">Creá y gestioná los formularios de captación de leads</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} />
          Nuevo formulario
        </button>
      </div>

      {/* New form inline */}
      {creating && (
        <div className="bg-white border border-blue-200 rounded-xl p-4">
          <form onSubmit={handleCreate} className="flex items-center gap-3">
            <FileCode2 size={18} className="text-blue-500 flex-shrink-0" />
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nombre del formulario (ej: Formulario principal)"
              className="flex-1 border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={createMutation.isPending || !newName.trim()}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Creando…' : 'Crear'}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewName('') }}
              className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancelar
            </button>
          </form>
        </div>
      )}

      {/* Forms list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-xl border animate-pulse" />)}
        </div>
      ) : forms.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <FileCode2 size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">Sin formularios aún</p>
          <p className="text-xs text-slate-400 mt-1">Creá tu primer formulario para empezar a captar leads</p>
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map(form => (
            <FormRow
              key={form.id}
              form={form}
              isMenuOpen={openMenu === form.id}
              isCopied={copiedId === form.id}
              onMenuToggle={() => setOpenMenu(openMenu === form.id ? null : form.id)}
              onEdit={() => router.push(`/settings/forms/${form.id}`)}
              onToggle={() => toggleMutation.mutate({ id: form.id, active: !form.active })}
              onDelete={() => { deleteMutation.mutate(form.id); setOpenMenu(null) }}
              onCopy={() => copySnippet(form.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FormRow({ form, isMenuOpen, isCopied, onMenuToggle, onEdit, onToggle, onDelete, onCopy }: {
  form: FormWithStats
  isMenuOpen: boolean
  isCopied: boolean
  onMenuToggle: () => void
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
  onCopy: () => void
}) {
  return (
    <div className="bg-white rounded-xl border hover:border-slate-300 transition-colors">
      <div className="flex items-center gap-4 p-4">
        {/* Color dot */}
        <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center"
          style={{ background: form.color + '18' }}>
          <FileCode2 size={16} style={{ color: form.color }} />
        </div>

        {/* Name + id */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="text-sm font-medium text-slate-900 hover:text-blue-600 transition-colors truncate">
              {form.name}
            </button>
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full font-medium',
              form.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            )}>
              {form.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 font-mono truncate">{form.id}</p>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
          <Stat icon={Users} label="Leads" value={form.stats.total_leads} />
          <Stat icon={Zap} label="7 días" value={form.stats.leads_7d} />
          <Stat icon={TrendingUp} label="Conversión" value={`${form.stats.conversion_rate}%`} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onCopy}
            title="Copiar snippet"
            className="p-2 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            {isCopied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
          </button>
          <button
            onClick={onEdit}
            title="Editar"
            className="p-2 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <Pencil size={15} />
          </button>
          <div className="relative">
            <button
              onClick={onMenuToggle}
              className="p-2 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <MoreHorizontal size={15} />
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border rounded-lg shadow-lg z-10 py-1">
                <button onClick={() => { onToggle(); onMenuToggle() }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  {form.active ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                  {form.active ? 'Desactivar' : 'Activar'}
                </button>
                <button onClick={onDelete}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                  <Trash2 size={14} />
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="flex items-center gap-1 text-slate-400 justify-center mb-0.5">
        <Icon size={12} />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}
