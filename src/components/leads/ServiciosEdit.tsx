'use client'

import { SERVICIOS } from '@/types'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface ServiciosEditProps {
  value: string[]
  onChange: (servicios: string[]) => void
  disabled?: boolean
}

export function ServiciosEdit({ value, onChange, disabled }: ServiciosEditProps) {
  const toggle = (s: string) => {
    if (disabled) return
    onChange(
      value.includes(s)
        ? value.filter((x) => x !== s)
        : [...value, s]
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {SERVICIOS.map((s) => {
        const active = value.includes(s)
        return (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
              active
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600',
              disabled && 'cursor-not-allowed opacity-60'
            )}
          >
            {active && <Check size={10} />}
            {s}
          </button>
        )
      })}
    </div>
  )
}
