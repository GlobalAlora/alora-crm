'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLeadFormStore } from '@/hooks/useLeadFormStore'
import { leadsApi, usersApi } from '@/lib/api'
import type { LeadFuente } from '@/types'

const FUENTES: { value: LeadFuente; label: string }[] = [
  { value: 'formulario', label: 'Formulario web' },
  { value: 'referido', label: 'Referido' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'chatbot', label: 'Chatbot' },
  { value: 'otro', label: 'Otro' },
]

const SERVICIOS = [
  'Diseño web', 'Mantenimiento web', 'SEO', 'Google Ads', 'Meta Ads',
  'Redes sociales', 'Branding', 'Email marketing', 'Chatbot', 'IA automatización', 'Otro',
]

const PAISES = [
  'Argentina', 'Bolivia', 'Brasil', 'Chile', 'Colombia', 'Costa Rica',
  'Ecuador', 'El Salvador', 'España', 'Guatemala', 'Honduras', 'México',
  'Nicaragua', 'Panamá', 'Paraguay', 'Perú', 'Uruguay', 'Venezuela',
  'Estados Unidos', 'Canadá', 'Otro',
]

const INPUT =
  'w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow'

export function LeadForm() {
  const { isOpen, editingLead, close } = useLeadFormStore()
  const queryClient = useQueryClient()

  const empty = {
    nombre: '', email: '', telefono: '', empresa: '', pais: '',
    servicio_interesado: '', presupuesto_estimado: '', fuente: '' as LeadFuente | '',
    valor_propuesta_usd: '', notas: '', responsable_id: '',
  }

  const [form, setForm] = useState(empty)

  useEffect(() => {
    if (!isOpen) return
    if (editingLead) {
      setForm({
        nombre: editingLead.nombre ?? '',
        email: editingLead.email ?? '',
        telefono: editingLead.telefono ?? '',
        empresa: editingLead.empresa ?? '',
        pais: editingLead.pais ?? '',
        servicio_interesado: editingLead.servicio_interesado ?? '',
        presupuesto_estimado: editingLead.presupuesto_estimado?.toString() ?? '',
        fuente: editingLead.fuente ?? '',
        valor_propuesta_usd: editingLead.valor_propuesta_usd?.toString() ?? '',
        notas: editingLead.notas ?? '',
        responsable_id: editingLead.responsable_id ?? '',
      })
    } else {
      setForm(empty)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingLead?.id])

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    staleTime: 5 * 60_000,
    enabled: isOpen,
  })

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        nombre: form.nombre.trim(),
        email: form.email || undefined,
        telefono: form.telefono || undefined,
        empresa: form.empresa || undefined,
        pais: form.pais || undefined,
        servicio_interesado: form.servicio_interesado || undefined,
        presupuesto_estimado: form.presupuesto_estimado ? Number(form.presupuesto_estimado) : undefined,
        fuente: (form.fuente || undefined) as LeadFuente | undefined,
        valor_propuesta_usd: form.valor_propuesta_usd ? Number(form.valor_propuesta_usd) : undefined,
        notas: form.notas || undefined,
        responsable_id: form.responsable_id || undefined,
      }
      return editingLead ? leadsApi.update(editingLead.id, payload) : leadsApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(editingLead ? 'Lead actualizado' : 'Lead creado')
      close()
    },
    onError: (e: Error) => toast.error(e.message || 'Error al guardar'),
  })

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre.trim()) { toast.error('El nombre es requerido'); return }
    mutation.mutate()
  }

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, close])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" onClick={close} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto pointer-events-auto">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-xl z-10">
            <h2 className="font-semibold text-slate-900 text-base">
              {editingLead ? 'Editar lead' : 'Nuevo lead'}
            </h2>
            <button onClick={close} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">

            {/* Contacto */}
            <section className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Contacto</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Nombre <span className="text-red-400">*</span></span>
                  <input value={form.nombre} onChange={set('nombre')} placeholder="Juan Pérez" required className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Empresa</span>
                  <input value={form.empresa} onChange={set('empresa')} placeholder="Empresa SA" className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Email</span>
                  <input type="email" value={form.email} onChange={set('email')} placeholder="juan@empresa.com" className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Teléfono</span>
                  <input value={form.telefono} onChange={set('telefono')} placeholder="+54 11 0000-0000" className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">País</span>
                  <select value={form.pais} onChange={set('pais')} className={INPUT}>
                    <option value="">Seleccionar...</option>
                    {PAISES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Fuente</span>
                  <select value={form.fuente} onChange={set('fuente')} className={INPUT}>
                    <option value="">Seleccionar...</option>
                    {FUENTES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </label>
              </div>
            </section>

            {/* Negocio */}
            <section className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Negocio</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Servicio de interés</span>
                  <select value={form.servicio_interesado} onChange={set('servicio_interesado')} className={INPUT}>
                    <option value="">Seleccionar...</option>
                    {SERVICIOS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Presupuesto estimado (USD)</span>
                  <input type="number" min="0" value={form.presupuesto_estimado} onChange={set('presupuesto_estimado')} placeholder="0" className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Valor propuesta (USD)</span>
                  <input type="number" min="0" value={form.valor_propuesta_usd} onChange={set('valor_propuesta_usd')} placeholder="0" className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Responsable</span>
                  <select value={form.responsable_id} onChange={set('responsable_id')} className={INPUT}>
                    <option value="">Sin asignar</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </label>
              </div>
            </section>

            {/* Notas */}
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Notas</span>
              <textarea
                value={form.notas} onChange={set('notas')}
                rows={3} placeholder="Contexto adicional..."
                className={`${INPUT} resize-none`}
              />
            </label>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={close} className="px-4 py-2 text-sm text-slate-600 rounded-md hover:bg-slate-100 transition-colors">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {mutation.isPending ? 'Guardando...' : editingLead ? 'Guardar cambios' : 'Crear lead'}
              </button>
            </div>

          </form>
        </div>
      </div>
    </>
  )
}
