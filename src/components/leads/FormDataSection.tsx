'use client'

import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import type { Lead } from '@/types'

interface FormField {
  name: string
  label: string
  type: string
}

interface FormConfig {
  title: string
  fields: FormField[]
}

interface FormDataSectionProps {
  lead: Lead
}

// Fields already shown in the standard lead info section — skip them here
const STANDARD_FIELDS = new Set([
  'nombre', 'apellido', 'email', 'telefono', 'empresa',
  'servicio_interesado', 'mensaje', 'notas', 'presupuesto_estimado',
])

export function FormDataSection({ lead }: FormDataSectionProps) {
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null)

  // Only render if the lead came from a form and has extra data
  const formData = lead.form_data
  if (!formData || Object.keys(formData).length === 0) return null

  const customEntries = Object.entries(formData).filter(
    ([key]) => !STANDARD_FIELDS.has(key)
  )

  if (customEntries.length === 0) return null

  return (
    <FormDataSectionInner
      lead={lead}
      customEntries={customEntries}
      formConfig={formConfig}
      setFormConfig={setFormConfig}
    />
  )
}

function FormDataSectionInner({
  lead,
  customEntries,
  formConfig,
  setFormConfig,
}: {
  lead: Lead
  customEntries: [string, string][]
  formConfig: FormConfig | null
  setFormConfig: (c: FormConfig | null) => void
}) {
  const formId = lead.form_id

  useEffect(() => {
    if (!formId) return
    fetch(`/api/embed/config?formId=${formId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data) setFormConfig(res.data)
      })
      .catch(() => {})
  }, [formId, setFormConfig])

  const getLabel = (key: string): string => {
    if (formConfig) {
      const field = formConfig.fields.find((f) => f.name === key)
      if (field) return field.label
    }
    // Fallback: humanize key
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex items-center gap-2 mb-3">
        <FileText size={14} className="text-slate-400" />
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Datos del formulario
        </h4>
      </div>
      <div className="space-y-2">
        {customEntries.map(([key, value]) => (
          <div key={key} className="flex gap-2">
            <span className="text-xs text-slate-500 min-w-0 w-32 shrink-0 pt-0.5">
              {getLabel(key)}
            </span>
            <span className="text-xs text-slate-800 font-medium break-words min-w-0">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
