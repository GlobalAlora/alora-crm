'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { useLeadFormStore } from '@/hooks/useLeadFormStore'
import { leadsApi, usersApi } from '@/lib/api'
import { SERVICIOS, PAISES, FUENTES, PIPELINE_STAGES } from '@/types'
import type { LeadFuente, PipelineStage } from '@/types'
import { RichTextEditor } from '@/components/shared/RichTextEditor'

const INPUT =
  'w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow'

interface FormState {
  nombre: string
  apellido: string
  email: string
  email_secundario: string
  telefono: string
  empresa: string
  sitio_web: string
  pais: string
  servicios_interesados: string[]
  fuente: LeadFuente | ''
  estado_pipeline: PipelineStage | ''
  valor_propuesta: string
  valor_propuesta_moneda: 'USD' | 'ARS'
  notas: string
  responsable_id: string
}

const emptyForm: FormState = {
  nombre: '', apellido: '', email: '', email_secundario: '', telefono: '', empresa: '', sitio_web: '',
  pais: '', servicios_interesados: [], fuente: '', estado_pipeline: '',
  valor_propuesta: '', valor_propuesta_moneda: 'USD',
  notas: '', responsable_id: '',
}

export function LeadForm() {
  const { isOpen, editingLead, close } = useLeadFormStore()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(emptyForm)

  useEffect(() => {
    if (!isOpen) return
    if (editingLead) {
      setForm({
        nombre: editingLead.nombre ?? '',
        apellido: editingLead.apellido ?? '',
        email: editingLead.email ?? '',
        email_secundario: editingLead.email_secundario ?? '',
        telefono: editingLead.telefono ?? '',
        empresa: editingLead.empresa ?? '',
        sitio_web: editingLead.sitio_web ?? '',
        pais: editingLead.pais ?? '',
        servicios_interesados: editingLead.servicios_interesados ?? [],
        fuente: editingLead.fuente ?? '',
        estado_pipeline: editingLead.estado_pipeline ?? '',
        valor_propuesta: editingLead.valor_propuesta_moneda === 'ARS'
          ? (editingLead.valor_propuesta_ars?.toString() ?? '')
          : (editingLead.valor_propuesta_usd?.toString() ?? ''),
        valor_propuesta_moneda: editingLead.valor_propuesta_moneda ?? 'USD',
        notas: editingLead.notas ?? '',
        responsable_id: editingLead.responsable_id ?? '',
      })
    } else {
      setForm(emptyForm)
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
        apellido: form.apellido.trim() || undefined,
        email: form.email || undefined,
        email_secundario: form.email_secundario || undefined,
        telefono: form.telefono || undefined,
        empresa: form.empresa || undefined,
        sitio_web: form.sitio_web || undefined,
        pais: form.pais || undefined,
        servicios_interesados: form.servicios_interesados,
        servicio_interesado: form.servicios_interesados[0] || undefined,
        fuente: (form.fuente || undefined) as LeadFuente | undefined,
        estado_pipeline: form.estado_pipeline || undefined,
        valor_propuesta_usd: form.valor_propuesta_moneda === 'USD' && form.valor_propuesta
          ? Number(form.valor_propuesta) : null,
        valor_propuesta_ars: form.valor_propuesta_moneda === 'ARS' && form.valor_propuesta
          ? Number(form.valor_propuesta) : null,
        valor_propuesta_moneda: form.valor_propuesta_moneda,
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

  const set = <K extends keyof FormState>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const toggleServicio = (s: string) => {
    setForm((f) => ({
      ...f,
      servicios_interesados: f.servicios_interesados.includes(s)
        ? f.servicios_interesados.filter((x) => x !== s)
        : [...f.servicios_interesados, s],
    }))
  }

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
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto pointer-events-auto">

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
                  <input value={form.nombre} onChange={set('nombre')} placeholder="Juan" required className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Apellido</span>
                  <input value={form.apellido} onChange={set('apellido')} placeholder="Pérez" className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Email</span>
                  <input type="email" value={form.email} onChange={set('email')} placeholder="juan@empresa.com" className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Email secundario</span>
                  <input type="email" value={form.email_secundario} onChange={set('email_secundario')} placeholder="juan.personal@gmail.com" className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Teléfono</span>
                  <input value={form.telefono} onChange={set('telefono')} placeholder="+54 11 0000-0000" className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Empresa</span>
                  <input value={form.empresa} onChange={set('empresa')} placeholder="Empresa SA" className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Sitio web</span>
                  <input type="url" value={form.sitio_web} onChange={set('sitio_web')} placeholder="https://empresa.com" className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">País</span>
                  <select value={form.pais} onChange={set('pais')} className={INPUT}>
                    <option value="">Seleccionar...</option>
                    {PAISES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
              </div>
            </section>

            {/* Servicios de interés */}
            <section className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Servicios de interés
                {form.servicios_interesados.length > 0 && (
                  <span className="ml-2 normal-case font-normal text-blue-600">
                    ({form.servicios_interesados.length} seleccionado{form.servicios_interesados.length > 1 ? 's' : ''})
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {SERVICIOS.map((s) => {
                  const active = form.servicios_interesados.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleServicio(s)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        active
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                      }`}
                    >
                      {active && <Check size={11} />}
                      {s}
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Negocio */}
            <section className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Negocio</p>
              <div className="grid grid-cols-2 gap-3">

                {/* Valor propuesta con moneda */}
                <div className="space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-xs font-medium text-slate-600">Valor propuesta</span>
                  <div className="flex rounded-md overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
                    <div className="flex border-r border-slate-200 flex-shrink-0">
                      {(['USD', 'ARS'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, valor_propuesta_moneda: m }))}
                          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                            form.valor_propuesta_moneda === m
                              ? 'bg-slate-900 text-white'
                              : 'bg-white text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={form.valor_propuesta}
                      onChange={set('valor_propuesta')}
                      placeholder="0"
                      className="flex-1 px-3 py-1.5 text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>
                </div>

                {!editingLead && (
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-slate-600">Etapa del pipeline</span>
                    <select value={form.estado_pipeline} onChange={set('estado_pipeline')} className={INPUT}>
                      <option value="">Lead entrante (por defecto)</option>
                      {PIPELINE_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                )}
                <label className="space-y-1">
                  <span className="text-xs font-medium text-slate-600">Fuente</span>
                  <select value={form.fuente} onChange={set('fuente')} className={INPUT}>
                    <option value="">Seleccionar...</option>
                    {FUENTES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </label>

                <label className="space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-xs font-medium text-slate-600">Responsable</span>
                  <select value={form.responsable_id} onChange={set('responsable_id')} className={INPUT}>
                    <option value="">Sin asignar</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </label>
              </div>
            </section>

            {/* Notas */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-600">Notas</span>
              <RichTextEditor
                content={form.notas}
                onChange={(html) => setForm(f => ({ ...f, notas: html }))}
                minimal={true}
              />
            </div>

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
