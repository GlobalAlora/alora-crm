'use client'

import type { LeadTag, LeadList, SegmentFilters } from '@/types'

interface Props {
  filters: SegmentFilters
  onChange: (f: SegmentFilters) => void
  tags: LeadTag[]
  lists: LeadList[]
  stages: { value: string; label: string }[]
  servicios: string[]
  paises: string[]
}

function MultiSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  renderOption,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T[] | undefined
  onChange: (v: T[]) => void
  renderOption?: (opt: { value: T; label: string }) => React.ReactNode
}) {
  const selected = value ?? []
  const toggle = (v: T) =>
    selected.includes(v) ? onChange(selected.filter((x) => x !== v)) : onChange([...selected, v])

  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-200 text-slate-600 hover:border-blue-400'
              }`}
            >
              {renderOption ? renderOption(opt) : opt.label}
            </button>
          )
        })}
        {options.length === 0 && <p className="text-xs text-slate-400 italic">No hay opciones</p>}
      </div>
    </div>
  )
}

export function SegmentBuilder({ filters, onChange, tags, lists, stages, servicios, paises }: Props) {
  const hasFilters = Object.values(filters).some((v) => Array.isArray(v) && v.length > 0)

  return (
    <div className="space-y-4">
      {/* Lists — when selected, ignores other filters */}
      <MultiSelect
        label="Listas (si seleccionás una lista, se usa como destinatario principal)"
        options={lists.map((l) => ({ value: l.id, label: `${l.name} (${l.lead_count ?? 0})` }))}
        value={filters.list_ids}
        onChange={(v) => onChange({ ...filters, list_ids: v })}
      />

      {/* Only show other filters if no list selected */}
      {(!filters.list_ids || filters.list_ids.length === 0) && (
        <>
          <MultiSelect
            label="Etiquetas"
            options={tags.map((t) => ({ value: t.id, label: t.name }))}
            value={filters.tag_ids}
            onChange={(v) => onChange({ ...filters, tag_ids: v })}
            renderOption={(opt) => {
              const tag = tags.find((t) => t.id === opt.value)
              return (
                <span className="flex items-center gap-1">
                  {tag && <span className="w-2 h-2 rounded-full inline-block" style={{ background: tag.color }} />}
                  {opt.label}
                </span>
              )
            }}
          />

          <MultiSelect
            label="Etapa del pipeline"
            options={stages.map((s) => ({ value: s.value, label: s.label }))}
            value={filters.estado_pipeline}
            onChange={(v) => onChange({ ...filters, estado_pipeline: v })}
          />

          <MultiSelect
            label="Servicios de interés"
            options={servicios.map((s) => ({ value: s, label: s }))}
            value={filters.servicios_interesados}
            onChange={(v) => onChange({ ...filters, servicios_interesados: v })}
          />

          <MultiSelect
            label="País"
            options={paises.map((p) => ({ value: p, label: p }))}
            value={filters.paises}
            onChange={(v) => onChange({ ...filters, paises: v })}
          />
        </>
      )}

      {!hasFilters && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
          Sin filtros = se enviará a TODOS los leads que tengan email. Seleccioná al menos un criterio.
        </p>
      )}
    </div>
  )
}
